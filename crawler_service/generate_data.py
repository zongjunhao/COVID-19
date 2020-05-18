import json
import pandas
from datetime import timedelta
from datetime import datetime


def run():
    init_data()


def init_data():
    """
    初始化数据
    :return: 处理过时间并初步过滤后的数据
    """

    # 从这一天开始处理，避免从头处理，提升速度
    date_start = datetime(2020, 1, 24, 0, 0)

    # 读取
    raw_data = pandas.read_json('../data/raw/DXYArea-TimeSeries.json', 'r', encoding='utf-8')
    data_df_dxy = raw_data

    data_df_dxy.rename(columns={'locationId':'ZipCode'})

    # 处理时间，将lastUpdate设置为日期格式，updateTime设置为“月份/日期”
    # print(data_df_dxy['updateTime'])
    data_df_dxy['lastUpdate'] = pandas.to_datetime(data_df_dxy['updateTime'], unit='ms') + timedelta(hours=8)
    data_df_dxy = data_df_dxy.loc[(data_df_dxy['lastUpdate'] >= date_start), :]
    data_df_dxy['updateTime'] = data_df_dxy['lastUpdate'].apply(lambda x: x.strftime('%m/%d'))
    # print(data_df_dxy[['updateTime', 'lastUpdate', 'provinceName']])

    data_df_dxy

    print([column for column in data_df_dxy])

    return data_df_dxy


def generate_by_date(data_df_dxy: pandas.DataFrame):
    # 提取省列表
    df_t = data_df_dxy['countryName']
    df_province = df_t.drop_duplicates()  # 去重 这个返回Series对象
    # print(df_province)


# data_dic = {'Science': {'A': 1589508092575, 'B': 1589508092575}, 'Art': {'B': 1589508092575, 'A': 1589508092575},
#             'Fashion': {'A': 1589508092575, 'B': 1589508092575}}
# data_df = pandas.DataFrame(data_dic)
# data_df['Science'] = pandas.to_datetime(data_df['Science'], unit='ms')
# print(data_df)
# data_df['Science'] = data_df['Science'] + timedelta(hours=8)
# print(data_df)
# data_df['date'] = data_df['Science'].apply(lambda x: x.strftime('%m/%d'))
# print(data_df)

run()

data = ['provinceName', 'currentConfirmedCount', 'confirmedCount', 'confirmedCountRank', 'suspectedCount', 'curedCount',
        'deadCount', 'deadCountRank', 'deadRate', 'deadRateRank', 'comment', 'locationId', 'countryShortCode', 'countryFullName',
        'incrVo', 'continentName', 'countryName', 'provinceShortName', 'continentEnglishName', 'countryEnglishName',
        'provinceEnglishName', 'updateTime', 'cities', 'createTime', 'modifyTime', 'cityName', 'lastUpdate']
# "name": "湖北省",
# "provinceName": "湖北省",
# "confirmedCount": 549,
# "curedCount": 31,
# "deadCount": 24,
# "updateTime": "1/24",
# "lastUpdate": "2020-01-24T09:30:09.000Z",
# "zipCode": "420000",
# "suspectedCount": 0,
# "insickCount": 494,
# "confirmedIncreased": 549,
# "curedIncreased": 31,
# "deadIncreased": 24,
# "cityList":
