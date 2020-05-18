from crawler_service.db import DB
import os
import json
import time
import logging
import requests

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

# 存储的数据
collections = {
    'DXYOverall': 'overall',
    'DXYArea': 'area',
}


class Listener:
    def __init__(self):
        self.db = DB()

    def run(self):
        while True:
            self.listener()
            time.sleep(3600)

    def listener(self):
        changed_files = list()
        for collection in collections:
            json_file = open('../data/raw/' + collection + '.json', 'r', encoding='utf-8')
            try:
                static_data = json.load(json_file)
            except (UnicodeDecodeError, FileNotFoundError, json.decoder.JSONDecodeError):
                static_data = None
            json_file.close()
            print(static_data)
            while True:
                request = requests.get(url='https://lab.isaaclin.cn/nCoV/api/' + collections.get(collection))
                if request.status_code == 200:
                    current_data = request.json()
                    break
                else:
                    time.sleep(1)
                    continue
            if static_data != current_data:
                self.json_dumper(collection=collection, content=current_data)
                changed_files.append('../data/raw/' + collection + '.json')
                cursor = self.db.dump(collection=collection)
                self.db_dumper(collection=collection, cursor=cursor)
                changed_files.append('../data/raw/' + collection + '-TimeSeries.json')
            logger.info('{collection} checked!'.format(collection=collection))
        # if changed_files:
        #     git_manager(changed_files=changed_files)

    def json_dumper(self, collection, content=None):
        json_file = open('../data/raw/' + collection + '.json', 'w', encoding='utf-8')
        json.dump(content, json_file, ensure_ascii=False, indent=4)
        json_file.close()

    def db_dumper(self, collection, cursor):
        data = list()
        if collection != 'DXYArea':
            for document in cursor:
                document.pop('_id')
                data.append(document)
        else:
            for document in cursor:
                document.pop('_id')
                document.pop('statisticsData', None)
                document.pop('showRank', None)
                document.pop('operator', None)
                data.append(document)

        json_file = open('../data/raw/' + collection + '-TimeSeries.json', 'w', encoding='utf-8')
        json.dump(data, json_file, ensure_ascii=False, indent=4)
        json_file.close()


if __name__ == '__main__':
    listener = Listener()
    listener.run()
