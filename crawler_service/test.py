import json

# with open('../data/name_map.json', 'r', encoding='utf-8') as ff:
#     json.dump(data, ff, ensure_ascii=False)
result = json.load(open('../data/name_map.json', 'r', encoding='utf-8'))
print(result)
# for item in result:
#     print(item)

dict_new2 = dict(zip(result.values(), result.keys()))
print(dict_new2)
