#!/usr/bin/env python
# -*- coding: utf-8 -*-

__author__ = "XiaoLin"
__email__ = "lolilin@outlook.com"
__license__ = "MIT"
__version__ = "0.2.3"
__status__ = "Production"

import os,re,requests,configparser
from mutagen.mp3 import MP3, HeaderNotFoundError
from mutagen.id3 import ID3, APIC, TPE1, TIT2, TALB, error
from mutagen.flac import Picture, FLAC
from datetime import datetime
from operator import itemgetter
from PIL import Image
CONFIG = configparser.ConfigParser()
CONFIG.read('config.ini')
SERVER = CONFIG['General']['server']
requests = requests.Session()

def format_string(string):
    """
    Replace illegal character with ' '
    """
    return re.sub(r'[\\/:*?"<>|\t]', ' ', string)

def get_lyric_time(line):
    result = re.match(r"\[(?P<minute>\w+):(?P<second>\w+)\.(?P<millisecond>\w+)\]", line)
    if result is None:
        return False
    result = result.groupdict()
    return float(result['minute']) * 60 + float(result['second'] + '.' + result['millisecond'])

def gen_lyric_time(time):
    minute = int(time / 60)
    second = time % 60
    minute = str(minute)
    second = str(second)

    se, ms, ms = second.partition('.')
    ms = (ms + "0" * 2)[:2]
    second = ".".join([se, ms])

    if len(minute) == 1:
        minute = '0' + minute
    if len(second.split('.')[0]) == 1:
        second = '0' + second
    
    return "[{}:{}]".format(minute,second)

def download_file(file_url, file_name, folder):
    class ProgressBar(object):
        def __init__(self, file_name, total):
            super().__init__()
            self.file_name = file_name
            self.count = 0
            self.prev_count = 0
            self.total = total
            self.end_str = '\r'

        def __get_info(self):
            return 'Progress: {:6.2f}%, {:8.2f}KB, [{:.30}]'\
                .format(self.count/self.total*100, self.total/1024, self.file_name)

        def refresh(self, count):
            self.count += count
            # Update progress if down size > 10k
            if (self.count - self.prev_count) > 10240:
                self.prev_count = self.count
                print(self.__get_info(), end=self.end_str)
            # Finish downloading
            if self.count >= self.total:
                self.end_str = '\n'
                print(self.__get_info(), end=self.end_str)
    if not os.path.exists(folder):
        os.makedirs(folder)
    file_path = os.path.join(folder, file_name)

    response = requests.get(file_url, stream=True)
    length = int(response.headers.get('Content-Length'))

    # TODO need to improve whether the file exists
    if os.path.exists(file_path) and os.path.getsize(file_path) > length:
        return True

    progress = ProgressBar(file_name, length)

    with open(file_path, 'wb') as file:
        for buffer in response.iter_content(chunk_size=1024):
            if buffer:
                file.write(buffer)
                progress.refresh(len(buffer))
    return False

print("CloudMan Version {}".format(__version__) + "\n")

# Create target Directory if don't exist
dirName = './../MUSIC/CloudMan'
if not os.path.exists(dirName):
    os.mkdir(dirName)

dirName = './../MUSIC/CloudMan/MUSIC'
if not os.path.exists(dirName):
    os.mkdir(dirName)

if CONFIG['PlayList']['genListForFolder']:
    files = os.listdir("./../MUSIC")
    for dir_name in files:
        if os.path.isdir(os.path.join("./../MUSIC", dir_name)):
            if dir_name == "CloudMan":
                continue
            playlist_file = open("./../MUSIC/{}.m3u".format(dir_name), 'w', encoding='utf8')
            playlist_file.writelines("#EXTM3U\n")
            folder = os.listdir(os.path.join("./../MUSIC", dir_name))
            for track in folder:
                if not os.path.isdir(os.path.join("./../MUSIC", dir_name,track)):
                    if track.endswith('flac') or track.endswith('mp3'):
                        playlist_file.writelines('\n{}/{}'.format(dir_name,track))
            playlist_file.close()
            print("Successfully generated playlist for folder: {}".format(dir_name))
    print("")

if CONFIG['General']['enableLogin']:
    login = requests.get(SERVER + "login/cellphone?phone={}&password={}".format(CONFIG['General']['cellphone'],CONFIG['General']['password'])).json()
    if not login['code'] == 200:
        print("Login failed: " + login['msg'])
        exit()
    UID = login['profile']['userId']
    print("Login success")
else:
    UID = CONFIG['General']['UID']

playlist = requests.get(SERVER + "user/playlist?uid=" + str(UID)).json()

for extraList in CONFIG['PlayList']['extraList'].split(','):
    tmp = requests.get(SERVER + "playlist/detail?id=" + extraList.replace(" ", "")).json()
    if tmp['code'] == 200:
        playlist['playlist'].append({
            'name': tmp['playlist']['name'],
            'id': tmp['playlist']['id']
        })
        print("Successfully get all tracks from playlist {}".format(tmp['playlist']['name']))
del tmp, extraList
print("")

excludeList = []
for tmp in CONFIG['PlayList']['excludeList'].split(','):
    if not re.search(r"\w+",tmp) is None:
        excludeList.append(int(tmp.replace(" ", "")))

playlist['playlist'] = [x for x in playlist['playlist'] if x['id'] not in excludeList]

print("The list of playlists we're going to download:")
for list in playlist['playlist']:
    print("{} ({})".format(list['name'],list['id']))
del list, excludeList
print("")

for list in playlist['playlist']:
    playlist_name = list['name']
    playlist_tracks = requests.get(SERVER + "playlist/detail?id=" + str(list['id'])).json()['playlist']['tracks']

    print('Downloading playlist: ' + playlist_name)
    playlist_file = dirName + '/../' + format_string(playlist_name) + '.m3u'
    if os.path.exists(playlist_file):
        os.remove(playlist_file)

    playlist_file = open(playlist_file, 'w', encoding='utf8')
    playlist_file.writelines("#EXTM3U\n")
    i = 0
    for track in playlist_tracks:
        i += 1
        print('{}: {}'.format(i, track['name']))

        track_name = format_string(track['name'])

        # download song
        track_url = requests.get(SERVER + 'song/url?br={}&id='.format(CONFIG['General']['bitRate']) + str(track['id'])).json()['data'][0]['url']
        if track_url is None:
            print('Song <<{}>> is not available due to copyright issue!'.format(track_name))
            continue
        
        track_file_name = '{}.{}'.format(str(track['id']),os.path.splitext(track_url)[-1][1:])
        track_file_path = os.path.join(dirName, track_file_name)
        is_exist = download_file(track_url, track_file_name, dirName)

        playlist_file.writelines("\n" + 'MUSIC/' + track_file_name)

        if is_exist:
            print('Music file already download:', track_file_name)
            continue

        # download cover
        cover_url = track['al']['picUrl']
        cover_file_name = 'cover_{}.jpg'.format(track['id'])
        cover_file_path = os.path.join(dirName, cover_file_name)
        download_file(cover_url, cover_file_name, dirName)

        # resize cover
        try:
            img = Image.open(cover_file_path)
            if img.size[0] > 640 or img.size[1] > 640:
                img.thumbnail((640,640), Image.ANTIALIAS)
            if img.format == 'PNG':
                img = img.convert('RGB')
            img.save(cover_file_path, quality=90)
        except IOError:
            print('Can\'t open image:', cover_file_path)

        # add metadata for song
        if os.path.splitext(track_url)[-1][1:] != 'flac':
            # id3
            try:
                audio = MP3(track_file_path, ID3=ID3)
                if audio.tags is None:
                    print('No ID3 tag, trying to add one!')
                    try:
                        audio.add_tags()
                        audio.save()
                    except error as e:
                        print('Error occur when add tags:', str(e))
                
                # Modify ID3 tags
                id3 = ID3(track_file_path)
                # Remove old 'APIC' frame
                # Because two 'APIC' may exist together with the different description
                # For more information visit: http://mutagen.readthedocs.io/en/latest/user/id3.html
                if id3.getall('APIC'):
                    id3.delall('APIC')
                # add album cover
                id3.add(APIC(encoding=0,mime='image/jpeg',type=3,data=open(cover_file_path, 'rb').read()))

                artists = []
                for artist in track['ar']:
                    artists.append(artist['name'])
                # add artist name
                id3.add(TPE1(text=artists))
                # add song name
                id3.add(TIT2(encoding=3,text=track['name']))
                # add album name
                id3.add(TALB(encoding=3,text=track['al']['name']))
                id3.save(v2_version=3)
            except HeaderNotFoundError:
                print('Can\'t sync to MPEG frame, not an validate MP3 file!')
        else:
            try:
                audio = FLAC(track_file_path)
                if audio.tags is None:
                    print('No ID3 tag, trying to add one!')
                    try:
                        audio.add_tags()
                        audio.save()
                    except error as e:
                        print('Error occur when add tags:', str(e))

                audio['title'] = track['name']
                artists = []
                for artist in track['ar']:
                    artists.append(artist['name'])
                audio['artist'] = artists
                audio['album'] = track['al']['name']

                image = Picture()
                image.type = 3
                image.desc = 'front cover'
                image.mime = 'image/jpeg'
                image.width = 640
                image.height = 640
                image.data = open(cover_file_path, 'rb').read()

                audio.save()
                audio.clear_pictures()
                audio.add_picture(image)
                audio.save()
            except HeaderNotFoundError:
                print('Can\'t sync to MPEG frame, not an validate FLAC file!')

        # delete cover file
        os.remove(cover_file_path)

        track_lyric_raw = requests.get(SERVER + 'lyric?id=' + str(track['id'])).json()

        if ('lrc' in track_lyric_raw) and not(track_lyric_raw['lrc']['lyric'] is None):
            track_lyric_file = open(os.path.join(dirName, str(track['id']) + '.lrc'), 'w', encoding='utf8')
            if ('tlyric' in track_lyric_raw) and (track_lyric_raw['tlyric']['version'] != 0) and not(track_lyric_raw['tlyric']['lyric'] is None):
                track_lyric = track_lyric_raw['lrc']['lyric'].split('\n')
                track_lyric_trans = track_lyric_raw['tlyric']['lyric'].split('\n')
                lyric = []

                for a in track_lyric:
                    time = get_lyric_time(a)
                    if not time:
                        continue

                    data = {
                        'time': time,
                        'type': 0,
                        'content': re.sub(r"^\[\w+\:\w+\.\w+\]","",a)
                    }
                    lyric.append(data)

                for a in track_lyric_trans:
                    time = get_lyric_time(a)
                    if not time:
                        continue

                    data = {
                        'time': time,
                        'type': 1,
                        'content': re.sub(r"^\[\w+\:\w+\.\w+\]","",a)
                    }
                    lyric.append(data)

                lyric = sorted(lyric,key = itemgetter('time', 'type'))
                for key, value in enumerate(lyric):
                    if (value['type'] == 0) or (key == 0) or (key == len(lyric) - 1):
                        continue
                    if (lyric[key - 1]['type'] == 1):
                        continue
                    if not (lyric[key - 1]['time'] == value['time']):
                        continue

                    lyric[key]['time'] = lyric[key + 1]['time']

                for a in lyric:
                    track_lyric_file.writelines("{}{}\n".format(gen_lyric_time(a['time']),a['content']))
            else:
                track_lyric = track_lyric_raw['lrc']['lyric'].split('\n')
                for a in track_lyric:
                    time = get_lyric_time(a)
                    if not time:
                        continue
                    track_lyric_file.writelines(gen_lyric_time(time) + re.sub(r"^\[\w+\:\w+\.\w+\]","",a) + "\n")
            track_lyric_file.close()
    playlist_file.close()
    