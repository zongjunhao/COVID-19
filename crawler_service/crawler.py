import json
import logging
import random
import re
import time

import requests
from bs4 import BeautifulSoup

from crawler_service.db import DB
from crawler_service.nameMap import city_name_map, country_name_map, continent_name_map

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)
with open("useragent.txt") as f:
    user_agents = f.read().splitlines()


class Crawler:
    def __init__(self):
        self.session = requests.session()
        self.db = DB()
        self.crawl_timestamp = int()

    def crawler(self):
        # while True:
        self.session.headers.update({
            'user-agent': random.choice(user_agents)
        })
        self.crawl_timestamp = int(time.time() * 1000)
        r = self.session.get(url='https://ncov.dxy.cn/ncovh5/view/pneumonia')
        soup = BeautifulSoup(r.content, 'lxml')

        # 综述
        overall_information = re.search(r'(\{"id".*\})\}', str(soup.find('script', attrs={'id': 'getStatisticsService'})))
        if overall_information:
            self.overall_parser(overall_information=overall_information)

        # 各省市确诊数据
        area_information = re.search(r'\[(.*)\]', str(soup.find('script', attrs={'id': 'getAreaStat'})))
        if area_information:
            self.area_parser(area_information=area_information)

        # 国外确诊数据
        abroad_information = re.search(r'\[(.*)\]', str(soup.find('script', attrs={'id': 'getListByCountryTypeService2true'})))
        if abroad_information:
            self.abroad_parser(abroad_information=abroad_information)

        logger.info('Successfully crawled.')

    # 综述
    def overall_parser(self, overall_information):
        overall_information = json.loads(overall_information.group(1))
        overall_information.pop('id')
        overall_information.pop('createTime')
        overall_information.pop('modifyTime')
        overall_information.pop('imgUrl')
        overall_information.pop('deleted')
        overall_information['countRemark'] = overall_information['countRemark'].replace(' 疑似', '，疑似'). \
            replace(' 治愈', '，治愈').replace(' 死亡', '，死亡').replace(' ', '')

        if not self.db.find_one(collection='DXYOverall', data=overall_information):
            overall_information['updateTime'] = self.crawl_timestamp

            self.db.insert(collection='DXYOverall', data=overall_information)
        # self.save_json_to_file("overall_information", overall_information)

    # 各省市确诊数据
    def area_parser(self, area_information):
        area_information = json.loads(area_information.group(0))
        self.save_json_to_file("area_information", area_information)
        for area in area_information:
            area['comment'] = area['comment'].replace(' ', '')

            # Because the cities are given other attributes,
            # this part should not be used when checking the identical document.
            cities_backup = area.pop('cities')

            if self.db.find_one(collection='DXYArea', data=area):
                continue

            # If this document is not in current database, insert this attribute back to the document.
            area['cities'] = cities_backup

            area['countryName'] = '中国'
            area['countryEnglishName'] = 'China'
            area['continentName'] = '亚洲'
            area['continentEnglishName'] = 'Asia'
            area['provinceEnglishName'] = city_name_map[area['provinceShortName']]['engName']

            for city in area['cities']:
                if city['cityName'] != '待明确地区':
                    try:
                        city['cityEnglishName'] = city_name_map[area['provinceShortName']]['cities'][city['cityName']]
                    except KeyError:
                        print(area['provinceShortName'], city['cityName'])
                        pass
                else:
                    city['cityEnglishName'] = 'Area not defined'

            area['updateTime'] = self.crawl_timestamp

            self.db.insert(collection='DXYArea', data=area)
        database_result = self.db.find('DXYArea')
        array = list(database_result)
        for data in array:
            print(data)
        json_result = json.dumps(array, ensure_ascii=False)
        json_result = json.loads(json_result)
        print(json_result)
        self.save_json_to_file('test', json_result)

    # 国外数据
    def abroad_parser(self, abroad_information):
        countries = json.loads(abroad_information.group(0))
        self.save_json_to_file('test_country', countries)
        for country in countries:
            try:
                country.pop('id')
                country.pop('tags')
                country.pop('sort')
                # Ding Xiang Yuan have a large number of duplicates,
                # values are all the same, but the modifyTime are different.
                # I suppose the modifyTime is modification time for all documents, other than for only this document.
                # So this field will be popped out.
                country.pop('modifyTime')
                # createTime is also different even if the values are same.
                # Originally, the createTime represent the first diagnosis of the virus in this area,
                # but it seems different for abroad information.
                country.pop('createTime')
                country['comment'] = country['comment'].replace(' ', '')
            except KeyError:
                pass
            country.pop('countryType')
            country.pop('provinceId')
            country.pop('cityName')
            # The original provinceShortName are blank string
            country.pop('provinceShortName')
            # Rename the key continents to continentName
            country['continentName'] = country.pop('continents')

            # if self.db.find_one(collection='DXYArea', data=country):
            #     continue

            country['countryName'] = country.get('provinceName')
            country['provinceShortName'] = country.get('provinceName')
            country['continentEnglishName'] = continent_name_map.get(country['continentName'])
            country['countryEnglishName'] = country_name_map.get(country['countryName'])
            country['provinceEnglishName'] = country_name_map.get(country['countryName'])
            country['insickCount'] = country.get('currentConfirmedCount')
            country['name'] = country.get('countryName')
            country['enName'] = country_name_map.get(country['countryName'])
            country['updateTime'] = self.crawl_timestamp

            self.db.insert(collection='DXYArea', data=country)

            country.pop('_id')

        self.save_json_to_file('charts_data/by_country', countries)
        print(countries)

    # 将json数据保存到文件中
    def save_json_to_file(self, filename, data):
        with open('../data/' + filename + '.json', 'w', encoding='utf-8') as ff:
            json.dump(data, ff, ensure_ascii=False)


if __name__ == '__main__':
    crawler = Crawler()
    crawler.crawler()
