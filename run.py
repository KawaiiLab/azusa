#!/usr/bin/env python
# -*- coding: utf-8 -*-

__author__ = "XiaoLin"
__email__ = "i@amxiaol.in"
__license__ = "MIT"
__version__ = "0.5.4"
__status__ = "Production"

import os, re, requests, configparser, json, signal, logging as log, coloredlogs
from mutagen.mp3 import MP3, HeaderNotFoundError
from mutagen.id3 import ID3, APIC, TPE1, TIT2, TALB, error
from mutagen.flac import Picture, FLAC, FLACNoHeaderError
from operator import itemgetter
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, wait
CONFIG = configparser.ConfigParser()
CONFIG.read('config.ini')
SERVER = CONFIG['General']['server']
requests = requests.Session()
coloredlogs.install(level=CONFIG['General']['logLevel'], fmt="%(asctime)s %(levelname)s %(message)s")
def format_string(string):
    """
    Replace illegal character with ' '
    """
    return re.sub(r'[\\/:*?"<>|\t]', ' ', string)

def is_number(s):
    try:
        float(s)
        return True
    except ValueError:
        return False

def get_lyric_time(line):
    result = re.match(r"\[(?P<minute>\w+):(?P<second>\w+)[.:](?P<millisecond>\w+)\]", line)
    if result is None:
        return False
    result = result.groupdict()
    if is_number(result['minute']) and is_number(result['second']) and is_number(result['millisecond']):
        return float(result['minute']) * 60 + round(float(result['second'] + '.' + result['millisecond']),2)
    else:
        return False

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

downloadedFile = []
if os.path.isfile('./Data/downloaded.json'):
    downloadedFile = json.loads(open('./Data/downloaded.json','r').read())
else:
    downloadedFile = []

def downloaded_music(id):
    global downloadedFile
    downloadedFile.append(id)
    open('./Data/downloaded.json','w').write(json.dumps(downloadedFile))
    return True

def is_downloaded(id):
    global downloadedFile
    if id in downloadedFile:
        return True
    return False

def validate_url(url):
    regex = re.compile(
        r'^(?:http|ftp)s?://'
        r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+(?:[A-Z]{2,6}\.?|[A-Z0-9-]{2,}\.?)|' #domain...
        r'localhost|'
        r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'
        r'(?::\d+)?'
        r'(?:/?|[/?]\S+)$', re.IGNORECASE)
    return re.match(regex, url) is not None

def download_file(file_url, file_name, folder, useMultithread = True):
    class Downloader(): 
        def __init__(self, url, num, name):
            self.url = url
            self.num = int(num)
            self.name = name
            self.useMultithread = useMultithread

        def down(self, start, end):

            headers = {'Range': 'bytes={}-{}'.format(start, end)}
            r = requests.get(self.url, headers=headers, stream=True)

            with open(self.name, "rb+") as f:
                f.seek(start)
                f.write(r.content)

        def run(self):
            if self.useMultithread:
                r = requests.head(self.url)
            if not self.useMultithread or not('Content-Length' in r.headers):
                log.info("Start downloading file {}".format(os.path.basename(file_name)) + " using single thread")
                response = requests.get(self.url, stream=True)

                with open(self.name, 'wb') as file:
                    for buffer in response.iter_content(chunk_size=1024):
                        if buffer:
                            file.write(buffer)
                log.info("File {} downloaded".format(os.path.basename(file_name)))
                return None

            log.info("Start downloading file {}".format(os.path.basename(file_name)))
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
            log.info("File {} downloaded".format(os.path.basename(file_name)))

    if not os.path.exists(folder):
        os.makedirs(folder)
    file_path = os.path.join(folder, file_name)
    Downloader(file_url,CONFIG['General']['threadNum'],file_path).run()

def check_retry_limit(id,list):
    if id in list and list[id] > 3:
        return 1
    elif id in list:
        list[id] += 1
        return 2
    else:
        return 0

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
            playlist_file.writelines("#EXTM3U\r\n")
            folder = os.listdir(os.path.join("./../MUSIC", dir_name))
            for track in folder:
                if not os.path.isdir(os.path.join("./../MUSIC", dir_name,track)):
                    if track.endswith('flac') or track.endswith('mp3'):
                        playlist_file.writelines('\r\n{}/{}'.format(dir_name,track))
            playlist_file.close()
            log.info("Successfully generated playlist for folder: {}".format(dir_name))

if CONFIG['General']['enableLogin'] == 'True':
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
del tmp, extraList

excludeList = []
for tmp in CONFIG['PlayList']['excludeList'].split(','):
    if not re.search(r"\w+",tmp) is None:
        excludeList.append(int(tmp.replace(" ", "")))

playlist['playlist'] = [x for x in playlist['playlist'] if x['id'] not in excludeList]

log.info("Playlist list:")
for list in playlist['playlist']:
    log.info("{} ({})".format(list['name'],list['id']))
del list, excludeList

for list in playlist['playlist']:
    playlist_name = list['name']
    playlist_tracks = requests.get(SERVER + "playlist/detail?id=" + str(list['id'])).json()['playlist']['trackIds']
    log.debug(json.dumps(playlist_tracks))

    log.info('Downloading playlist: ' + playlist_name)
    playlist_file = playlist_file_path = dirName + '/../' + format_string(playlist_name) + '.m3u'
    if os.path.exists(playlist_file):
        os.remove(playlist_file)

    playlist_file = open(playlist_file, 'w', encoding='utf8')
    playlist_file.writelines("#EXTM3U\r\n")
    i = 0
    track_error = {}
    for track in playlist_tracks:
        i += 1
        log.info('{}: {}'.format(i, track['id']))

        if is_downloaded(track['id']):
            log.info('Music file exists')
            if os.path.isfile(os.path.join(dirName,str(track['id']) + '.mp3')):
                playlist_file.writelines("\r\n" + 'MUSIC/' + str(track['id']) + '.mp3')
            else:
                playlist_file.writelines("\r\n" + 'MUSIC/' + str(track['id']) + '.flac')
            playlist_file.flush()
            continue

        status = check_retry_limit(track['id'], track_error)
        if status == 1:
            log.error('CANNOT download music: ' + track['id'])
            continue
        elif status == 2:
            log.warning('Retring download music: ' + track['id'])

        track = requests.get(SERVER + 'song/detail?ids=' + str(track['id'])).json()['songs']
        if (len(track) == 0):
            log.warning("Song not found")
            continue
        track = track[0]
        log.debug(json.dumps(track))

        track_name = format_string(track['name'])

        # download song
        track_url = requests.get(SERVER + 'song/url?br={}&id='.format(CONFIG['General']['bitRate']) + str(track['id'])).json()
        log.debug(json.dumps(track))
        if (not track_url is None) and 'data' in track_url:
            track_url = track_url['data'][0]['url']
        if track_url is None or not validate_url(track_url):
            log.warning('Song <<{}>> is not available due to copyright issue!'.format(track_name))
            continue
        
        try:
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
            cover_url = cover_url + '?param=640y640'
            log.debug(cover_url)
            download_file(cover_url, cover_file_name, dirName, False)
        except Exception as e:
            log.error('Error while downloading a file: ' + str(e))
            playlist_tracks.append(track)
            track_error[track['id']] = 1
            continue

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
        except Exception as e:
            log.error('Error while resizing cover: ' + str(e))
            playlist_tracks.append(track)
            track_error[track['id']] = 1
            continue

        try:
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
                            log.error('Error while adding tags:' + str(e))
                    
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
                    log.error('Not a validate MP3 file!')
                    playlist_tracks.append(track)
                    track_error[track['id']] = 1
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
                            log.error('Error occurs when add tags:' + str(e))

                    audio['title'] = track['name']

                    artists = []
                    artists_str = ''
                    for artist in track['ar']:
                        artists.append(artist['name'])
                        artists_str = artists_str + '/' + artist['name']

                    artists_str = artists_str[1:]
                    artists.append(artists_str)

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
                    log.debug(audio.tags)
                    audio.save()
                except FLACNoHeaderError:
                    log.error('Not a validate FLAC file!')
                    playlist_tracks.append(track)
                    track_error[track['id']] = 1
                    continue
        except Exception as e:
            log.error('Error while adding metadata: ' + str(e))
            playlist_tracks.append(track)
            track_error[track['id']] = 1
            continue

        # delete cover file
        os.remove(cover_file_path)

        try:
            log.info("Generating lyric file")
            track_lyric_raw = requests.get(SERVER + 'lyric?id=' + str(track['id'])).json()
            log.debug(json.dumps(track_lyric_raw))

            if ('lrc' in track_lyric_raw) and not(track_lyric_raw['lrc']['lyric'] is None):
                track_lyric_file = open(os.path.join(dirName, str(track['id']) + '.lrc'), 'w', encoding='utf8')
                if ('tlyric' in track_lyric_raw) and (track_lyric_raw['tlyric']['version'] != 0) and not(track_lyric_raw['tlyric']['lyric'] is None):
                    track_lyric = track_lyric_raw['lrc']['lyric'].split('\n')
                    track_lyric_trans = track_lyric_raw['tlyric']['lyric'].split('\n')

                    log.debug(track_lyric)
                    log.debug(track_lyric_trans)

                    lyric = []

                    for a in track_lyric:
                        time = get_lyric_time(a)
                        if not time:
                            continue

                        data = {
                            'time': time,
                            'type': 0,
                            'content': re.sub(r"\[\w+\:\w+[.:]\w+\]","",a)
                        }
                        log.debug(data)
                        lyric.append(data)

                    for a in track_lyric_trans:
                        time = get_lyric_time(a)
                        if not time:
                            continue

                        data = {
                            'time': time,
                            'type': 1,
                            'content': re.sub(r"\[\w+\:\w+[.:]\w+\]","",a)
                        }
                        log.debug(data)
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

                    log.debug(lyric)

                    for a in lyric:
                        track_lyric_file.writelines("{}{}\n".format(gen_lyric_time(a['time']),a['content']))
                else:
                    track_lyric = track_lyric_raw['lrc']['lyric'].split('\n')
                    for a in track_lyric:
                        time = get_lyric_time(a)
                        if not time:
                            continue
                        track_lyric_file.writelines(gen_lyric_time(time) + re.sub(r"^\[\w+\:\w+[.:]\w+\]","",a) + "\n")
                track_lyric_file.close()
                log.info("Lyric generated")
            else:
                log.info("No lyric")
        except Exception as e:
            log.error('Error while generating lyrics: ' + str(e))
            track_error[track['id']] = 1
            playlist_tracks.append(track)
            continue

        downloaded_music(track['id'])
    playlist_file.writelines("\r\n")
    playlist_file.close()