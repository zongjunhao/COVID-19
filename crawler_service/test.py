import json
import pandas

# def change(row):
#     row['New'] = row['Art'] + row['Fashion']
#     return row
#
#
# data_dic = {'Science': {1: 1, 2: 5, 3: 7}, 'Art': {1: 3, 2: 6, 3: 7}, 'Fashion': {1: 5, 2: 4, 3: 8}}
# data_df = pandas.DataFrame(data_dic)
# print(data_df)
# # for index, data in data_df.iterrows():
# #     data['Science'] = data['Art'] + data['Fashion']
# #     data_df.at[index] = data
# # print(data)
# data_df.at[2, 'Science'] = 100
# print(data_df)
#
# json_data = data_df.to_json(orient="records")
# json_data = json.loads(json_data)
# with open('../data/test.json', 'w', encoding='utf-8') as ff:
#     json.dump(json_data, ff, ensure_ascii=False)

# df = pandas.read_csv('../data/test.csv', 'r', encoding='utf-8')
# print(df)
# data_df.to_json('../data/test.json', orient="records")

csv_data = pandas.read_csv('../data/by_world.csv')
csv_data.rename(columns=lambda x: x.replace('provinceName', 'name'), inplace=True)
csv_data['value'] = csv_data['confirmedCount']
csv_data['date'] = pandas.to_datetime(csv_data['date'])
csv_data['date'] = csv_data['date'].apply(lambda x: x.strftime('%Y-%m-%d'))
json_data = csv_data.to_json(orient='records')
json_data = json.loads(json_data)
with open('../data/charts_data/by_world.json', 'w', encoding='utf-8') as ff:
    json.dump(json_data, ff, ensure_ascii=False)
