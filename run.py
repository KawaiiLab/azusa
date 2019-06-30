#!/usr/bin/env python
# -*- coding: utf-8 -*-

__author__ = "XiaoLin"
__email__ = "lolilin@outlook.com"
__license__ = "MIT"
__version__ = "0.2"
__status__ = "Production"

import os,re,requests,configparser
from mutagen.mp3 import MP3, HeaderNotFoundError
from mutagen.id3 import ID3, APIC, TPE1, TIT2, TALB, error
from mutagen.flac import Picture, FLAC
from datetime import datetime
from PIL import Image
CONFIG = configparser.ConfigParser()
CONFIG.read('config.ini')
SERVER = CONFIG['General']['server']

def format_string(string):
    """
    Replace illegal character with ' '
    """
    return re.sub(r'[\\/:*?"<>|\t]', ' ', string)

def get_lyric_time(line):
    if (re.search(r"\]+",line) is None) or (len(line.split(']')) < 2) or (len(line.split(']')[0].split(':')) < 2):
        return False
    minute = line.split(']')[0].split(':')[0][1:]
    second = line.split(']')[0].split(':')[1]
    if (not (minute is None and second is None)) and not (re.search(r"^\w+$",minute) is None or re.search(r"^\w+\.\w+$",second) is None):
        return int(minute), float(second)
    return False

def gen_lyric_time(minute,second):
    minute = str(minute)
    if len(minute) == 1:
        minute = '0' + minute
    if second < 0:
        second = str(0.0)
    else:
        second = str(second)
    if len(second.split('.')[0]) == 1:
        second = '0' + second
    if len(second.split('.')[1]) == 1:
        second = second + '0'
    else:
        second = second.split('.')[0] + '.' + second.split('.')[1][0:2]
    
    return "[{}:{}]".format(minute, second)

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
            print("Generating playlist for folder: {}".format(dir_name))
            playlist_file = open("./../MUSIC/{}.m3u".format(dir_name), 'w', encoding='utf8')
            playlist_file.writelines("#EXTM3U\n")
            folder = os.listdir(os.path.join("./../MUSIC", dir_name))
            for track in folder:
                if not os.path.isdir(os.path.join("./../MUSIC", dir_name,track)):
                    if track.endswith('flac') or track.endswith('mp3'):
                        playlist_file.writelines('\n{}/{}'.format(dir_name,track))
            playlist_file.close()

del files,dir_name,folder,playlist_file
print("")

playlist = requests.get(SERVER + "user/playlist?uid=" + CONFIG['General']['UID']).json()

for extraList in CONFIG['PlayList']['extraList'].split(','):
    tmp = requests.get(SERVER + "playlist/detail?id=" + extraList.replace(" ", "")).json()
    if tmp['code'] == 200:
        playlist['playlist'].append({
            'name': tmp['playlist']['name'],
            'id': tmp['playlist']['id']
        })
del tmp, extraList

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
        track_url = requests.get(SERVER + 'song/url?br=9990000&id=' + str(track['id'])).json()['data'][0]['url']
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
                id3.add(
                    APIC(
                        encoding=0,         # 3 is for UTF8, but here we use 0 (LATIN1) for 163, orz~~~
                        mime='image/jpeg',  # image/jpeg or image/png
                        type=3,             # 3 is for the cover(front) image
                        data=open(cover_file_path, 'rb').read()
                    )
                )

                artists = []
                for artist in track['ar']:
                    artists.append(artist['name'])
                # add artist name
                id3.add(
                    TPE1(
                        text=artists
                    )
                )
                # add song name
                id3.add(
                    TIT2(
                        encoding=3,
                        text=track['name']
                    )
                )
                # add album name
                id3.add(
                    TALB(
                        encoding=3,
                        text=track['al']['name']
                    )
                )
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

                track_lyric_trans_offset = 0
                for key, value in enumerate(track_lyric):
                    if len(track_lyric_trans) == track_lyric_trans_offset:
                        track_lyric_trans_offset = -1
                        continue

                    if get_lyric_time(value) == False or get_lyric_time(track_lyric_trans[track_lyric_trans_offset]) == False:
                        track_lyric_trans_offset += 1
                        continue

                    ori_min, ori_sec = get_lyric_time(value)

                    track_lyric_file.writelines(gen_lyric_time(ori_min,ori_sec) + re.sub(r"^\[\w+\:\w+\.\w+\]","",value) + "\n")
                    if track_lyric_trans_offset == -1:
                        continue

                    trans_min, trans_sec = get_lyric_time(track_lyric_trans[track_lyric_trans_offset])

                    if key < len(track_lyric) and get_lyric_time(track_lyric[key + 1]) != False:
                        next_min, next_sec = get_lyric_time(track_lyric[key + 1])
                    else:
                        next_min, next_sec = get_lyric_time(value)
                        next_min += 10
                        track_lyric_trans_offset = -1

                    if (trans_min*60 + trans_sec > ori_min*60 + ori_sec) and (trans_min*60 + trans_sec < next_min*60 + next_sec):
                        track_lyric_file.writelines(gen_lyric_time(trans_min,trans_sec) + re.sub(r"^\[\w+\:\w+\.\w+\]","",track_lyric_trans[track_lyric_trans_offset]) + "\n")
                        track_lyric_trans_offset += 1
                    elif trans_min*60 + trans_sec == ori_min*60 + ori_sec:
                        track_lyric_file.writelines(gen_lyric_time(next_min,next_sec-0.02) + re.sub(r"^\[\w+\:\w+\.\w+\]","",track_lyric_trans[track_lyric_trans_offset]) + "\n")
                        track_lyric_trans_offset += 1
            else:
                track_lyric_file.write(track_lyric_raw['lrc']['lyric'])
            track_lyric_file.close()
    playlist_file.close()
    