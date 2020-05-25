import json
import logging
from datetime import datetime
from datetime import timedelta

import pandas

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

# pandas显示配置 方便调试
# 显示所有列
pandas.set_option('display.max_columns', None)
# 显示所有行
# pandas.set_option('display.max_rows', None)
# 设置value的显示长度为100，默认为50
pandas.set_option('max_colwidth', 200)


def run():
    data = init_data()
    generate_by_world(data)
    generate_by_date(data)


def init_data():
    """
    初始化数据
    """

    # 从这一天开始处理，避免从头处理，提升速度
    date_start = datetime(2020, 1, 24, 0, 0)

    # 读取
    raw_data = pandas.read_json('../data/raw/DXYArea-TimeSeries.json', 'r', encoding='utf-8')
    data_df_dxy = raw_data

    # 处理时间，将lastUpdate设置为日期格式，updateTime设置为“月份/日期”，仅保留1/24以后的数据，date用于后序遍历数据
    data_df_dxy['lastUpdate'] = pandas.to_datetime(data_df_dxy['updateTime'], unit='ms') + timedelta(hours=8)
    data_df_dxy = data_df_dxy.loc[(data_df_dxy['lastUpdate'] >= date_start), :]
    data_df_dxy['date'] = data_df_dxy['lastUpdate'].apply(lambda x: x.strftime('%Y-%m-%d'))
    data_df_dxy['date'] = pandas.to_datetime(data_df_dxy['date'])
    data_df_dxy['updateTime'] = data_df_dxy['lastUpdate'].apply(lambda x: x.strftime('%m/%d'))
    # print(data_df_dxy[['updateTime', 'lastUpdate', 'provinceName']])

    logger.info('Init data successful!')
    return data_df_dxy


# 生成根据日期的省市数据
def generate_by_date(data_df_dxy):
    # 仅保留中国数据
    data_df_dxy = data_df_dxy.loc[(data_df_dxy['countryName'] == '中国'), :]
    data_df_dxy = data_df_dxy.loc[(data_df_dxy['provinceName'] != '中国'), :]

    data_df_dxy['name'] = data_df_dxy['provinceName']
    # 删除列
    del data_df_dxy['confirmedCountRank']
    del data_df_dxy['deadCountRank']
    del data_df_dxy['deadRate']
    del data_df_dxy['deadRateRank']
    del data_df_dxy['comment']
    del data_df_dxy['countryShortCode']
    del data_df_dxy['countryFullName']
    del data_df_dxy['incrVo']
    del data_df_dxy['continentName']
    del data_df_dxy['countryName']
    del data_df_dxy['provinceShortName']
    del data_df_dxy['continentEnglishName']
    del data_df_dxy['countryEnglishName']
    del data_df_dxy['provinceEnglishName']
    del data_df_dxy['createTime']
    del data_df_dxy['modifyTime']
    del data_df_dxy['cityName']
    # 重命名列
    data_df_dxy.rename(columns=lambda x: x.replace('currentConfirmedCount', 'insickCount'), inplace=True)
    data_df_dxy.rename(columns=lambda x: x.replace('locationId', 'zipCode'), inplace=True)
    data_df_dxy.rename(columns=lambda x: x.replace('cities', 'cityList'), inplace=True)

    logger.info('By date, formatter data completed!')

    # 提取省列表
    df_temp = data_df_dxy['provinceName']
    df_province = df_temp.drop_duplicates()  # 去重 这个返回Series对象
    df_province = df_province.reset_index(drop=True)  # 重建索引

    # 重建索引
    logger.info('start')
    data_df_dxy = data_df_dxy.reset_index(drop=True)
    # 处理可能存在的现存确诊为空的情况，此处可能存在问题，改为apply
    data_df_dxy['insickCount'] = data_df_dxy['confirmedCount'] - data_df_dxy['curedCount'] - data_df_dxy['deadCount']
    print(data_df_dxy)
    logger.info('end')

    df = pandas.DataFrame(index=None)

    # 获取日期列表
    df_date = data_df_dxy['date']
    df_date = df_date.drop_duplicates()  # 去重 返回Series对象
    df_date = df_date.sort_values()

    new_list = []

    # 每个省份当天仅保留一条数据、清洗完毕后可能有的省份当天数据缺失
    for day in df_date:
        for name in df_province:
            logger.info(day.strftime('%Y-%m-%d') + name)
            # 找到当前省份当前日期对应的数据
            df1 = data_df_dxy.loc[(data_df_dxy['provinceName'].str.contains(name)) & (data_df_dxy['date'] == day), :]
            # 找出当天该省份最后更新的一条数据
            df2 = df1.loc[(df1['lastUpdate'] == df1['lastUpdate'].max()), :]
            df.append(df2)
            df = df.append(df2)
    print(df)

    # 补齐一个省的空数据
    for day in df_date:
        # 最后一天数据不处理
        if day == df_date.max():
            continue
        date_add = day + timedelta(days=1)
        for name in df_province:
            # 找到当前省份当前日期对应的数据
            df1 = df.loc[(df['provinceName'].str.contains(name)) & (df['date'] == day), :]
            # 该省份在当前日期有数据
            if df1.shape[0] > 0:
                # 寻找该省份在第二天的数据
                df2 = df.loc[(df['provinceName'].str.contains(name)) & (df['date'] == date_add), :]
                if df2.shape[0] == 0:  # 后面一天省数据为空 把当前数据填到后一天
                    logger.info('追加 ' + date_add.strftime('%Y-%m-%d') + name)

                    for index, data in df1.iterrows():  # 改变值 使用索引
                        time = df1.loc[index, 'lastUpdate']
                        df1.loc[index, 'date'] = date_add
                        df1.loc[index, 'lastUpdate'] = pandas.to_datetime(time) + timedelta(days=1)
                        df1.loc[index, 'updateTime'] = df1.loc[index, 'lastUpdate'].strftime('%m/%d')
                    df = df.append(df1)

    # 修改cityList中数据的格式
    df = df.reset_index(drop=True)
    except_num = 0
    logger.info("change the data format of city list start")
    for index, row in df.iterrows():
        province_name = row['provinceName']
        city_list = row['cityList']
        df_cities = pandas.DataFrame(city_list)
        if df_cities.empty:
            continue
        df_cities.rename(columns=lambda x: x.replace('cityName', 'name'), inplace=True)
        df_cities['provinceName'] = province_name
        df_cities['insickCount'] = df_cities['confirmedCount'] - df_cities['curedCount'] - df_cities['deadCount']
        new_city_list = json.loads(df_cities.to_json(orient="records"))
        df.at[index, 'cityList'] = new_city_list
        # row['cityList'] = json.loads(df_cities.to_json(orient="records"))
        # try:
        #     df.at[index] = row
        # except ValueError:
        #     except_num = except_num + 1
        #     logger.info('except_num', except_num)
        #     logger.info(row)
        #     continue
    logger.info("change the data format of city list end")

    # 将数据按时间组装
    logger.info("reload the data buy date start")
    df_by_date = pandas.DataFrame(index=None)
    data_list = []
    for day in df_date:
        day_str = day.strftime('%m/%d')
        # 筛选出当前日期所有省份的数据
        df1 = df.loc[(df['date'] == day), :]
        data_list.append({'day': day_str, 'records': json.loads(df1.to_json(orient="records"))})
        # day_data = pandas.DataFrame({'day': day_str, 'record': df1.to_json(orient="records")})
    df_by_date = df_by_date.append(data_list)
    logger.info("reload the data buy date end")

    # 输出数据，为保证excel打开兼容，输出为UTF8带签名格式
    df.to_csv('../data/test.csv', encoding="utf_8_sig", index=False)
    json_data = df.to_json(orient="records")
    json_data = json.loads(json_data)
    with open('../data/test1.json', 'w', encoding='utf-8') as ff:
        json.dump(json_data, ff, ensure_ascii=False)

    json_data2 = df_by_date.to_json(orient='records')
    json_data2 = json.loads(json_data2)
    with open('../data/charts_data/by_date.json', 'w', encoding='utf-8') as ff:
        json.dump(json_data2, ff, ensure_ascii=False)


# 生成世界数据，用于展示动态排名
def generate_by_world(data_df_dxy):
    del data_df_dxy['confirmedCountRank']
    del data_df_dxy['suspectedCount']
    del data_df_dxy['deadCountRank']
    del data_df_dxy['deadRate']
    del data_df_dxy['deadRateRank']
    del data_df_dxy['comment']
    del data_df_dxy['locationId']
    del data_df_dxy['countryShortCode']
    del data_df_dxy['countryFullName']
    del data_df_dxy['incrVo']
    del data_df_dxy['continentName']
    del data_df_dxy['countryName']
    del data_df_dxy['provinceShortName']
    del data_df_dxy['continentEnglishName']
    del data_df_dxy['countryEnglishName']
    del data_df_dxy['provinceEnglishName']
    del data_df_dxy['cities']
    del data_df_dxy['createTime']
    del data_df_dxy['cityName']
    del data_df_dxy['modifyTime']
    del data_df_dxy['updateTime']
    # 处理可能存在的现存确诊为空的情况
    data_df_dxy['currentConfirmedCount'] = data_df_dxy['confirmedCount'] - data_df_dxy['curedCount'] - data_df_dxy['deadCount']

    # 提取所有省份和国家
    df_temp = data_df_dxy['provinceName']
    df_province_and_country = df_temp.drop_duplicates()  # 去重 这个返回Series对象
    df_province_and_country = df_province_and_country.reset_index(drop=True)  # 重建索引

    # 重建索引
    data_df_dxy = data_df_dxy.reset_index(drop=True)

    df = pandas.DataFrame(index=None)

    # 获取日期列表
    df_date = data_df_dxy['date']
    df_date = df_date.drop_duplicates()  # 去重 返回Series对象
    df_date = df_date.sort_values()

    # 每个省份当天仅保留一条数据、清洗完毕后可能有的省份当天数据缺失
    for day in df_date:
        for name in df_province_and_country:
            logger.info(day.strftime('%Y-%m-%d') + name)
            # 找到当前省份当前日期对应的数据
            df1 = data_df_dxy.loc[(data_df_dxy['provinceName'].str.contains(name)) & (data_df_dxy['date'] == day), :]
            # 找出当天该省份最后更新的一条数据
            df2 = df1.loc[(df1['lastUpdate'] == df1['lastUpdate'].max()), :]
            df.append(df2)
            df = df.append(df2)
    print(df)

    # 补齐一个省的空数据
    for day in df_date:
        # 最后一天数据不处理
        if day == df_date.max():
            continue
        date_add = day + timedelta(days=1)
        for name in df_province_and_country:
            # 找到当前省份当前日期对应的数据
            df1 = df.loc[(df['provinceName'].str.contains(name)) & (df['date'] == day), :]
            # 该省份在当前日期有数据
            if df1.shape[0] > 0:
                # 寻找该省份在第二天的数据
                df2 = df.loc[(df['provinceName'].str.contains(name)) & (df['date'] == date_add), :]
                if df2.shape[0] == 0:  # 后面一天省数据为空 把当前数据填到后一天
                    logger.info('追加 ' + date_add.strftime('%Y-%m-%d') + name)

                    for index, data in df1.iterrows():  # 改变值 使用索引
                        time = df1.loc[index, 'lastUpdate']
                        df1.loc[index, 'date'] = date_add
                        df1.loc[index, 'lastUpdate'] = pandas.to_datetime(time) + timedelta(days=1)
                    df = df.append(df1)

    # 输出数据，为保证excel打开兼容，输出为UTF8带签名格式
    df.to_csv('../data/by_world.csv', encoding="utf_8_sig", index=False)


# 'provinceName', 'currentConfirmedCount', 'confirmedCount',
#        'confirmedCountRank', 'suspectedCount', 'curedCount', 'deadCount',
#        'deadCountRank', 'deadRate', 'deadRateRank', 'comment', 'locationId',
#        'countryShortCode', 'countryFullName', 'incrVo', 'continentName',
#        'countryName', 'provinceShortName', 'continentEnglishName',
#        'countryEnglishName', 'provinceEnglishName', 'updateTime', 'cities',
#        'createTime', 'modifyTime', 'cityName', 'lastUpdate', 'date'],
#       dtype='object'
run()
