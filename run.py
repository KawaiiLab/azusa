#!/usr/bin/env python
# -*- coding: utf-8 -*-

__author__ = "XiaoLin"
__email__ = "lolilin@outlook.com"
__license__ = "MIT"
__version__ = "0.4.5"
__status__ = "Production"

import os, re, requests, configparser, json, signal, logging as log, coloredlogs
from mutagen.mp3 import MP3, HeaderNotFoundError
from mutagen.id3 import ID3, APIC, TPE1, TIT2, TALB, error
from mutagen.flac import Picture, FLAC, FLACNoHeaderError
from datetime import datetime
from operator import itemgetter
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, wait
CONFIG = configparser.ConfigParser()
CONFIG.read('config.ini')
SERVER = CONFIG['General']['server']
requests = requests.Session()
coloredlogs.install(level=CONFIG['General']['logLevel'])

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

def downloaded_music(id):
    if os.path.isfile('./Data/downloaded.json'):
        data = json.loads(open('./Data/downloaded.json','r').read())
    else:
        data = []
    data.append(id)
    data = open('./Data/downloaded.json','w').write(json.dumps(data))
    
    return True

def is_downloaded(id):
    if os.path.isfile('./Data/downloaded.json'):
        data = json.loads(open('./Data/downloaded.json','r').read())
        if id in data:
            return True
    return False

def validate_url(url):
    regex = re.compile(
        r'^(?:http|ftp)s?://' # http:// or https://
        r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+(?:[A-Z]{2,6}\.?|[A-Z0-9-]{2,}\.?)|' #domain...
        r'localhost|' #localhost...
        r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})' # ...or ip
        r'(?::\d+)?' # optional port
        r'(?:/?|[/?]\S+)$', re.IGNORECASE)
    return re.match(regex, url) is not None

def download_file(file_url, file_name, folder):
    class Downloader(): 
        def __init__(self, url, num, name):
            self.url = url
            self.num = int(num)
            self.name = name

        def down(self, start, end):

            headers = {'Range': 'bytes={}-{}'.format(start, end)}
            r = requests.get(self.url, headers=headers, stream=True)

            with open(self.name, "rb+") as f:
                f.seek(start)
                f.write(r.content)

        def run(self):
            r = requests.head(self.url)
            if not 'Content-Length' in r.headers:
                log.warning('Get file length failed, use single thread to download')
                response = requests.get(self.url, stream=True)

                with open(self.name, 'wb') as file:
                    for buffer in response.iter_content(chunk_size=1024):
                        if buffer:
                            file.write(buffer)
                return None

            self.size = int(r.headers['Content-Length'])
            f = open(self.name, "wb")
            f.truncate(self.size)
            f.close()

            futures = []
            part = self.size // self.num 
            pool = ThreadPoolExecutor(max_workers = self.num)
            for i in range(self.num):
                start = part * i
                if i == self.num - 1:   
                    end = self.size
                else:
                    end = start + part - 1
                futures.append(pool.submit(self.down, start, end))
            wait(futures)

    if not os.path.exists(folder):
        os.makedirs(folder)
    file_path = os.path.join(folder, file_name)
    log.info("Start downloading file {}".format(os.path.basename(file_name)))
    Downloader(file_url,CONFIG['General']['threadNum'],file_path).run()
    log.info("File {} downloaded".format(os.path.basename(file_name)))

def quit(signum, frame):
    log.critical("Ctrl-C detected")
    exit()
signal.signal(signal.SIGINT, quit)
signal.signal(signal.SIGTERM, quit)

log.info("CloudMan Version {}".format(__version__))

# Create target directories if don't exist
dirName = './Data'
if not os.path.exists(dirName):
    os.mkdir(dirName)

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
            log.info("Successfully generated playlist for folder: {}".format(dir_name))

if CONFIG['General']['enableLogin']:
    login = requests.get(SERVER + "login/cellphone?phone={}&password={}".format(CONFIG['General']['cellphone'],CONFIG['General']['password'])).json()
    log.debug(json.dumps(login))
    if not login['code'] == 200:
        log.error("Login failed: " + login['msg'])
        exit()
    UID = login['profile']['userId']
    log.info("Login success")
else:
    UID = CONFIG['General']['UID']

playlist = requests.get(SERVER + "user/playlist?uid=" + str(UID)).json()
log.debug(json.dumps(playlist))

for extraList in CONFIG['PlayList']['extraList'].split(','):
    tmp = requests.get(SERVER + "playlist/detail?id=" + extraList.replace(" ", "")).json()
    log.debug(json.dumps(tmp))
    if tmp['code'] == 200:
        playlist['playlist'].append({
            'name': tmp['playlist']['name'],
            'id': tmp['playlist']['id']
        })
        log.info("Successfully get all tracks from playlist {}".format(tmp['playlist']['name']))
del tmp, extraList

excludeList = []
for tmp in CONFIG['PlayList']['excludeList'].split(','):
    if not re.search(r"\w+",tmp) is None:
        excludeList.append(int(tmp.replace(" ", "")))

playlist['playlist'] = [x for x in playlist['playlist'] if x['id'] not in excludeList]

log.info("The list of playlists we're going to download:")
for list in playlist['playlist']:
    log.info("{} ({})".format(list['name'],list['id']))
del list, excludeList

for list in playlist['playlist']:
    playlist_name = list['name']
    playlist_tracks = requests.get(SERVER + "playlist/detail?id=" + str(list['id'])).json()['playlist']['tracks']
    log.debug(json.dumps(playlist_tracks))

    log.info('Downloading playlist: ' + playlist_name)
    playlist_file = playlist_file_path = dirName + '/../' + format_string(playlist_name) + '.m3u'
    if os.path.exists(playlist_file):
        os.remove(playlist_file)

    playlist_file = open(playlist_file, 'w', encoding='utf8')
    playlist_file.writelines("#EXTM3U\n")
    i = 0
    for track in playlist_tracks:
        i += 1
        log.info('{}: {}'.format(i, track['name']))

        track_name = format_string(track['name'])

        if is_downloaded(track['id']):
            log.info('Music file already download')
            if os.path.isfile(os.path.join(dirName,str(track['id']) + '.mp3')):
                playlist_file.writelines("\n" + 'MUSIC/' + str(track['id']) + '.mp3')
            else:
                playlist_file.writelines("\n" + 'MUSIC/' + str(track['id']) + '.flac')
            playlist_file.flush()
            continue

        # download song
        track_url = requests.get(SERVER + 'song/url?br={}&id='.format(CONFIG['General']['bitRate']) + str(track['id'])).json()
        log.debug(json.dumps(track))
        if (not track_url is None) and 'data' in track_url:
            track_url = track_url['data'][0]['url']
        if track_url is None or not validate_url(track_url):
            log.warning('Song <<{}>> is not available due to copyright issue!'.format(track_name))
            continue
        
        track_file_name = '{}.{}'.format(str(track['id']),os.path.splitext(track_url)[-1][1:])
        track_file_path = os.path.join(dirName, track_file_name)
        download_file(track_url, track_file_name, dirName)

        playlist_file.writelines("\n" + 'MUSIC/' + track_file_name)
        playlist_file.flush()

        # download cover
        cover_url = track['al']['picUrl']
        if cover_url is None:
            cover_url = 'http://p1.music.126.net/9A346Q9fbCSmylIkId7U3g==/109951163540324581.jpg'
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
            log.warning('Can\'t open image:' + cover_file_path)

        # add metadata for song
        if os.path.splitext(track_url)[-1][1:] != 'flac':
            # id3
            try:
                audio = MP3(track_file_path, ID3=ID3)
                if audio.tags is None:
                    log.warning('No tags, trying to add one!')
                    try:
                        audio.add_tags()
                        audio.save()
                    except error as e:
                        log.error('Error occur when add tags:' + str(e))
                
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
                log.error('Can\'t sync to MPEG frame, not an validate MP3 file!')
                continue
        else:
            try:
                audio = FLAC(track_file_path)
                if audio.tags is None:
                    log.warning('No tags, trying to add one!')
                    try:
                        audio.add_tags()
                        audio.save()
                    except error as e:
                        log.error('Error occur when add tags:' + str(e))

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
            except FLACNoHeaderError:
                log.error('Can\'t sync to MPEG frame, not an validate FLAC file!')
                continue

        # delete cover file
        os.remove(cover_file_path)

        track_lyric_raw = requests.get(SERVER + 'lyric?id=' + str(track['id'])).json()
        log.debug(json.dumps(track_lyric_raw))

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

        downloaded_music(track['id'])
    playlist_file.writelines("\n")
    playlist_file.close()
    os.chmod(playlist_file_path,0o777)