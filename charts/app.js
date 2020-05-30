let allDataStore = {};  // 存储数据信息
let mapDisplayMetrics = 'current'; // 地图显示类型（累计确诊/当前确诊）
let chartsContainerId = 'chart_container'; // HTML中图表的显示位置
let allCharts = []; // 保存echarts图表

const modulesConfig = {
    // 中国趋势->总体趋势
    'summary': {
        func: showSummary,
    },
    // 中国趋势->新增概览
    'zerodays': {
        func: showZeroDays,
    },
    // 中国趋势->省市地图
    'map': {
        func: showMap,
        supportProvince: true,
    },
    // 中国趋势->全部城市地图
    'cities-map': {
        func: showAllCitiesMap,
    },
    // 世界地图
    'world-map': {
        func: showWorldMap,
    },
    // 中国趋势->省市趋势
    'trends': {
        func: showProvince,
        supportProvince: true,
    },
    // 各国趋势
    'world-trends': {
        func: showWorldTrends,
        supportProvince: true,
        provinceKey: 'continent',
        cityKey: 'country',
    },
    // 国家对比
    'countries-compare': {
        func: showCountriesCompare,
        supportProvince: true,
        provinceKey: 'metrics',
    },
};

// 获取所有tab（所有图表种类）
const allTabs = (() => {
    return $('#navbar a.nav-link, #navbar a.dropdown-item').get().reduce((p, v) => {
        const tab = v.href.split('&')[0].split('#')[1].split('=')[1];
        const titleMap = {
            'world-trends': '各国趋势',
            'countries-compare': '国家对比',
        };
        const url = '#' + v.href.split('#')[1];
        const item = {
            tab,
            el: v,
            title: titleMap[tab] || v.innerHTML.trim(),
            url,
            hasSubParam: url.indexOf('&') > -1,
        };
        if ($(v).hasClass('dropdown-item')) {
            item.isSubItem = true;
            item.parent = $('.dropdown-toggle', $(v).parent().parent());
            p[url] = item;
        }
        if (!item.hasSubParam) {
            p[tab] = item;
        }
        return p;
    }, {});
})();

// 当前日期
const todayStart = (() => {
    const today = new Date();
    today.setSeconds(0);
    today.setMinutes(0);
    today.setHours(0);
    today.setMinutes(480 + today.getTimezoneOffset());
    return today;
})();

// 显示加载画面
const showLoading = (() => {
    const el = $('#' + chartsContainerId);
    let loading = null;
    return function (show = true, pe) {
        if (typeof show === 'string') {
            const progress = pe && pe.lengthComputable ? `${Math.ceil(pe.loaded / pe.total * 100)}% ` : '';
            const msg = `Loading ${show} ${progress}...`;
            if (loading) {
                $('.loading-overlay-content', el.overlay).text(msg);
            } else {
                loading = el.loading({message: msg});
            }
        } else {
            if (show) {
                loading = el.loading({message: 'Loading ...'});
            } else {
                el.loading('stop');
                loading = null;
            }
        }
    };
})();

const chartTooltipCircle = function (color) {
    return `<span style='display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${color};margin-right:5px;'></span>`;
};

/**
 * 获取地图图例
 * @param type
 */
function getVisualPieces(type) {
    const pieces = {
        world: [
            {min: 50000, label: '50000+', color: 'rgb(143,31,25)'},
            {min: 10000, max: 49999, label: '10000-49999', color: 'rgb(185,43,35)'},
            {min: 5000, max: 9999, label: '5000-9999', color: 'rgb(213,86,78)'},
            {min: 1000, max: 4999, label: '1000-4999', color: 'rgb(239,140,108)'},
            {min: 100, max: 999, label: '100-999', color: 'rgb(248,211,166)'},
            {min: 1, max: 99, label: '1-99', color: 'rgb(252,239,218)'},
        ],
        country: [
            {min: 10000, label: '10000+', color: 'rgb(143,31,25)'},
            {min: 1000, max: 9999, label: '1000-9999', color: 'rgb(185,43,35)'},
            {min: 500, max: 999, label: '500-999', color: 'rgb(213,86,78)'},
            {min: 100, max: 499, label: '100-499', color: 'rgb(239,140,108)'},
            {min: 10, max: 99, label: '10-99', color: 'rgb(248,211,166)'},
            {min: 1, max: 9, label: '1-9', color: 'rgb(252,239,218)'},
        ],
        city: [
            {min: 1000, label: '1000+', color: 'rgb(143,31,25)'},
            {min: 500, max: 999, label: '500-999', color: 'rgb(185,43,35)'},
            {min: 100, max: 499, label: '100-499', color: 'rgb(213,86,78)'},
            {min: 50, max: 100, label: '50-99', color: 'rgb(239,140,108)'},
            {min: 10, max: 49, label: '10-49', color: 'rgb(248,211,166)'},
            {min: 1, max: 9, label: '1-9', color: 'rgb(252,239,218)'},
        ]
    };
    return pieces[type] || pieces.city;
}

/**
 * 准备地图图表
 * @param mapName 图表名
 */
async function prepareChartMap(mapName) {
    let geoJSON;
    // echarts中没有此张地图则添加，有则直接获取
    if (!echarts.getMap(mapName)) {
        const isProvince = ['china', 'china-cities', 'world'].indexOf(mapName) === -1;
        const url = `map/json/${isProvince ? 'province/' : ''}${mapName}.json`;
        geoJSON = (await axios.get(url, {
            onDownloadProgress: (pe) => {
                showLoading('map', pe);
            }
        })).data;
        echarts.registerMap(mapName, geoJSON);
    } else {
        geoJSON = echarts.getMap(mapName).geoJson;
    }
    return geoJSON;
}

/**
 * 使用axios获取数据
 * @param type 要获取数据的种类
 */
async function getData(type) {
    if (!allDataStore[type]) {
        const time = typeof built_timestamp !== 'undefined' ? parseInt(built_timestamp) || 1 : 1;
        const ret = await axios.get(`../data/charts_data/by_${type}.json?t=${time}`, {
            onDownloadProgress: (pe) => {
                if (pe.lengthComputable) {
                    showLoading('data', pe);
                }
            }
        });
        allDataStore[type] = ret.data;
    }
    return allDataStore[type];
}

// 去除省自治区等尾部称呼，简短字符串，方便在图表上显示
function shortAreaName(name) {
    return name.replace(/(区|省|市|自治区|壮|回|族|维吾尔)/g, '');
}

/**
 * 生成鼠标悬停时的提示信息
 * @param name  地区名称
 * @param r     地区数据
 * @returns {string}    提示的html信息
 */
function generateTooltip(name, r) {
    const baseSeries = [
        ['治愈', 'cured', 'rgb(64,141,39)'],
        ['死亡', 'dead', 'gray'],
        ['现存', 'insick', 'rgb(224,144,115)'],
    ];
    const total = r.confirmedCount;
    return `<b>${name}</b><table><tr><td>${chartTooltipCircle('darkred')}</td><td>${getTextForKey('确诊')}: </td><td>${total}</td></tr>${baseSeries.map(([name, key, color]) => {
        return `<tr><td>${chartTooltipCircle(color)}</td><td>${getTextForKey(name)}: </td><td class='text-right'>${r[key + 'Count']} </td><td class='text-right'>(${(Math.floor(r[key + 'Count'] / total * 10000) / 100).toFixed(2)}%)</td></tr>`;
    }).join('')}</table>`;
}

/**
 * 生成侧边图表的配置
 * @param data 数据
 */
function generateMapSideBarChartConfig(data) {
    const baseSeries = [
        {
            name: '治愈',
            color: 'rgb(64,141,39)',
            key: 'cured',
        },
        {
            name: '死亡',
            color: 'gray',
            key: 'dead',
        },
        {
            name: '现存',
            color: 'rgb(224,144,115)',
            key: 'insick',
        },
    ];
    return [
        ...baseSeries,
        {
            name: '总计',
            color: 'white',
            key: '',
        }
    ].map(c => {
        if (c.key) {
            return {
                name: getTextForKey(c.name),
                color: c.color,
                stack: '人数',
                type: 'bar',
                label: {
                    position: 'inside',
                    show: false,
                    color: '#eee',
                    formatter: ({data}) => {
                        return data[0] > 0 ? data[0] : '';
                    }
                },
                barMaxWidth: 30,
                data: data.map(r => {
                    return [
                        r[c.key + 'Count'],
                        r[getCurrentLang() === 'zh' ? 'name' : 'enName'],
                        r,
                    ];
                }),
                tooltip: {
                    formatter: ({data}) => {
                        const r = data[2];
                        return generateTooltip(data[1], r);
                    }
                }
            };
        } else {
            return {
                stack: '人数',
                type: 'bar',
                label: {
                    position: 'right',
                    show: true,
                    color: '#333',
                    formatter: ({data}) => {
                        return `${data[2]}`;
                    }
                },
                data: data.map(r => [0, r[getCurrentLang() === 'zh' ? 'name' : 'enName'], r.confirmedCount])
            };
        }
    });
}

/**
 * 趋势图['确诊', '治愈', '死亡', '治疗', '新增确诊', '新增治愈', '新增死亡']
 * @param data 数据
 */
function createTrendsChartConfig(data) {
    const {name, enName, records} = data;
    const hasCity = !!data.cityList;
    const days = records.map(v => v.updateTime);                // 日期
    const confirmed = records.map(v => v.confirmedCount);       // 累计确诊数
    const increase = records.map(v => v.confirmedIncreased);    // 新增确诊
    const cured = records.map(v => v.curedCount);               // 治愈数
    const curedIncrease = records.map(v => v.curedIncreased);   // 新增治愈
    const dead = records.map(v => v.deadCount);                 // 死亡数
    const deadIncrease = records.map(v => v.deadIncreased);     // 新增死亡
    const insick = records.map(v => v.insickCount);             // 现存确诊

    let markArea = {};
    if (new Date(data.lastUpdate) < todayStart) {
        markArea = {
            itemStyle: {
                color: '#eee',
            },
            silent: true,
            data: [[{
                name: '未更新',
                label: {
                    color: '#aaa',
                },
                xAxis: records[Math.max(records.length - 2, 0)].updateTime,
            }, {
                xAxis: records[records.length - 1].updateTime,
            }]]
        };
    }

    return {
        title: [
            {
                text: getCurrentLang() === 'zh' ? name : (enName || name),
                link: hasCity ? `javascript:showProvince('${name}')` : '',
                target: 'self',
            },
            {
                text: data.lastUpdate ? `${getTextForKey('最后更新时间：')}${new Date(data.lastUpdate).toLocaleString('zh-CN')}` : '',
                right: 20, top: 4,
                textStyle: {fontSize: 12, fontWeight: 'normal', color: '#666',},
            }
        ],
        tooltip: {
            trigger: 'axis'
        },
        legend: {
            data: ['确诊', '治愈', '死亡', '治疗', '新增确诊', '新增治愈', '新增死亡'].map(k => getTextForKey(k)),
            textStyle: {
                fontSize: 11,
            },
            bottom: 0,
        },
        grid: {
            y: 50,
            y2: 70,
        },
        xAxis: {
            type: 'category',
            data: days,
        },
        yAxis: [
            {
                type: 'value',
            },
            {
                type: 'value',
                splitLine: {show: false,},
            },
        ],
        series: [
            {
                name: getTextForKey('确诊'),
                data: confirmed,
                type: 'line',
            },
            {
                name: getTextForKey('治愈'),
                data: cured,
                type: 'line',
            },
            {
                name: getTextForKey('死亡'),
                data: dead,
                type: 'line',
            },
            {
                name: getTextForKey('治疗'),
                data: insick,
                type: 'line',
            },
            {
                name: getTextForKey('新增确诊'),
                data: increase,
                type: 'bar',
                yAxisIndex: 1,
            },
            {
                name: getTextForKey('新增治愈'),
                data: curedIncrease,
                type: 'bar',
                yAxisIndex: 1,
            },
            {
                name: getTextForKey('新增死亡'),
                data: deadIncrease,
                type: 'bar',
                yAxisIndex: 1,
                markArea,
            },
        ]
    };
}

/**
 * 比例趋势图，通用
 * @param data           数据
 * @param seriesConfig   序列数据（图表内要显示的数据有那些）
 * @param overrideConfig 图表属性配置
 */
function createRateTrendsChartConfig(data, seriesConfig = [], overrideConfig = {}) {
    const nameKey = getCurrentLang() === 'en' ? 'enName' : 'name';
    const displayName = data[nameKey] || data.name;
    const {records} = data;
    const days = records.map(item => item.updateTime);
    const seriesKeyMap = {};
    const series = seriesConfig.map(item => {
        seriesKeyMap[item.name] = item.key;
        return Object.assign({
            name: item.name,
            data: records.map(r => r[item.key]),
            type: 'line',
            tooltip: {formatter: '{b}: {c}%'}
        }, item.config || {})
    });

    const config = {
        title: [
            {
                text: displayName,
            },
        ].concat(data.lastUpdate ?
            [
                {
                    text: data.lastUpdate ? `${getTextForKey('最后更新时间：')}${new Date(data.lastUpdate).toLocaleString('zh-CN')}` : '',
                    right: 20, top: 4,
                    textStyle: {fontSize: 12, fontWeight: 'normal', color: '#666',},
                }
            ] : []),
        tooltip: {
            trigger: 'axis',
            formatter: (params) => {
                if (params && params.length > 0) {
                    return `<b>${params[0].name}<b><br />${params.map(v => {
                        return (`${v.seriesName}：${v.value || '--'}`) + (seriesKeyMap[v.seriesName].indexOf('Rate') > 0 ? '%' : '');
                    }).join('<br />')}`;
                }
                return '';
            }
        },
        legend: {
            data: series.map(s => s.name),
            textStyle: {
                fontSize: 11,
            },
            bottom: 0,
        },
        grid: {
            y: 50,
            y2: 70,
        },
        xAxis: {
            type: 'category',
            data: days,
        },
        yAxis: [
            {
                type: 'value',
                axisLabel: {
                    formatter: '{value}%',
                }
            },
            {
                type: 'value',
                splitLine: {show: false},
            },
        ],
        series,
    };

    Object.keys(overrideConfig).forEach(k => {
        config[k] = Object.assign(config[k] || {}, overrideConfig[k]);
    });

    return config;
}

// 切换地图显示现存确诊/累计确诊
function switchMapMetrics(m) {
    mapDisplayMetrics = m;
    handleHashChanged();
}

/**
 * 地图属性配置
 * @param mapName   地图名
 * @param data      每日各地数据
 * @param valueKey  控制地图显示累计确诊或现存确诊，将对应数值存储在value中
 */
async function createMapChartConfig({mapName, data, valueKey = 'confirmedCount'}) {
    // 显示累计确诊或现存确诊
    valueKey = mapDisplayMetrics === 'accum' ? 'confirmedCount' : 'insickCount';
    let geoJSON = await prepareChartMap(mapName);
    geoJSON.features.forEach(v => {
        const showName = v.properties.name;
        data.forEach(day => {
            day.records.forEach(r => {
                const name = r.name;
                if (name.substr(0, showName.length) === showName || showName.substr(0, name.length) === name) {
                    r.showName = showName;
                }
            });
        });
    });

    // 地图配色
    const visualPieces = getVisualPieces(mapName === 'china' ? 'country' : 'city');

    const hideBarChart = (mapName === 'china-cities');

    // 左侧条形柱状图设置
    const barSeriesConfig = {
        stack: '人数',
        type: 'bar',
        label: {
            position: 'inside',
            show: true,
            color: '#eee',
            formatter: ({data}) => {
                return data[0] > 0 ? data[0] : '';
            }
        },
        tooltip: {
            formatter: ({data}) => {
                return generateTooltip(data[1], data[2]);
            },
        },
        barMaxWidth: 30,
    }

    // 地图图表设置
    return {
        baseOption: {
            title: {
                text: mapDisplayMetrics === 'accum' ? getTextForKey('当前显示累计确诊') : getTextForKey('当前显示现存确诊'),
                link: `javascript:switchMapMetrics("${mapDisplayMetrics === 'accum' ? 'current' : 'accum'}")`,
                target: 'self',
                bottom: '10',
                left: '10',
            },
            // 底部时间线
            timeline: {
                axisType: 'category',
                // realtime: false,
                // loop: false,
                autoPlay: false,
                currentIndex: data.length - 1,
                playInterval: 300,
                // controlStyle: {
                //     position: 'left'
                // },
                data: data.map(d => d.day),
            },
            tooltip: {
                show: true,
                trigger: 'item',
            },
            // toolbox: {
            //   show: true,
            //   orient: 'vertical',
            //   left: 'right',
            //   top: 'center',
            //   feature: {
            //     dataView: {readOnly: false},
            //     restore: {},
            //     saveAsImage: {}
            //   }
            // },
            grid: hideBarChart ? [] : [
                {
                    top: 10,
                    width: '100%',
                    left: 10,
                    containLabel: true
                }
            ],
            xAxis: hideBarChart ? [] : [
                {
                    type: 'value',
                    axisLine: {show: false,},
                    axisTick: {show: false,},
                    axisLabel: {show: false,},
                    splitLine: {show: false,},
                }
            ],
            yAxis: hideBarChart ? [] : [
                {
                    type: 'category',
                    axisLabel: {
                        show: true,
                        interval: 0,
                    },
                    axisTick: {show: false,},
                    axisLine: {show: false,},
                }
            ],
            visualMap: [
                {
                    type: 'piecewise',
                    pieces: visualPieces,
                    left: 'auto',
                    right: 30,
                    bottom: 100,
                    seriesIndex: 0,
                },
                // {
                //   type: 'piecewise',
                //   pieces: visualPieces,
                //   dimension: 0,
                //   show: false,
                //   seriesIndex: 1,
                // },
            ],
            series: [
                {
                    name: '',
                    type: 'map',
                    mapType: mapName,
                    label: {
                        show: !hideBarChart,
                    },
                    left: hideBarChart ? 'center' : '30%',
                    // 地图悬浮提示
                    tooltip: {
                        formatter: ({name, data}) => {
                            if (data) {
                                // const {name, /*value,*/ confirmed, dead, cured, increased, insick} = data;
                                // return `<b>${name}</b><br />${getTextForKey('现存确诊：')}${insick}<br />${getTextForKey('累计确诊：')}${confirmed}<br />${getTextForKey('治愈人数：')}${cured}<br />${getTextForKey('死亡人数：')}${dead}<br />${getTextForKey('新增确诊：')}${increased}`;
                                const {name, record} = data;
                                return generateTooltip(name, record);
                            }
                            return `<b>${name}</b><br />${getTextForKey('暂无数据')}`;
                        },
                    },
                    z: 1000,
                }
            ].concat((hideBarChart ? [] : [
                {
                    name: getTextForKey('治愈'),
                    color: 'rgb(64,141,39)',
                },
                {
                    name: getTextForKey('死亡'),
                    color: 'gray',
                },
                {
                    name: getTextForKey('治疗'),
                    color: 'rgb(224,144,115)',
                }
            ].map(c => {
                return Object.assign({}, barSeriesConfig, c);
            })))
        },
        options: data.map(d => {
            d.records.sort((a, b) => a.confirmedCount < b.confirmedCount ? -1 : 1);
            return {
                series: [
                    {
                        title: {
                            text: d.day,
                        },
                        data: d.records.map(r => {
                            return {
                                name: r.showName,
                                province: r.name,
                                value: r[valueKey],
                                record: r,
                                confirmed: r.confirmedCount,
                                dead: r.deadCount,
                                cured: r.curedCount,
                                increased: r.confirmedIncreased,
                                insick: r.insickCount,
                            };
                        }),
                    },
                ].concat(hideBarChart ? [] : ['cured', 'dead', 'insick'].map(k => {
                    return {
                        data: d.records.map(r => {
                            return [r[k + 'Count'], r.showName || r.name, r];
                        })
                    };
                }))
            };
        })
    };
}

/**
 * 趋势图
 * @param records   数据
 * @returns {*}
 */
function setupTrendsCharts(records) {
    const cls = records.length > 1 ? 'trends-chart' : 'single-chart';

    const configs = records.map(v => createTrendsChartConfig(v));
    return showChartsWithConfigs(configs, cls);
}

/**
 * 设置地图图表
 * @param records   图表数据
 * @param container 显示容器
 * @param province  省份
 * @param allCities 是否显示所有城市（省份图/全部城市图）
 */
async function setupMapCharts(records, container, province = '', allCities = false) {
    const mapName = !province ? (allCities ? 'china-cities' : 'china') : {
        '安徽': 'anhui',
        '澳门': 'aomen',
        '北京': 'beijing',
        '重庆': 'chongqing',
        '福建': 'fujian',
        '甘肃': 'gansu',
        '广东': 'guangdong',
        '广西': 'guangxi',
        '贵州': 'guizhou',
        '海南': 'hainan',
        '河北': 'hebei',
        '黑龙江': 'heilongjiang',
        '河南': 'henan',
        '湖北': 'hubei',
        '湖南': 'hunan',
        '江苏': 'jiangsu',
        '江西': 'jiangxi',
        '吉林': 'jilin',
        '辽宁': 'liaoning',
        '内蒙古': 'neimenggu',
        '宁夏': 'ningxia',
        '青海': 'qinghai',
        '山东': 'shandong',
        '上海': 'shanghai',
        '山西': 'shanxi',
        '陕西': 'shanxi1',
        '四川': 'sichuan',
        '台湾': 'taiwan',
        '天津': 'tianjin',
        '香港': 'xianggang',
        '新疆': 'xinjiang',
        '西藏': 'xizang',
        '云南': 'yunnan',
        '浙江': 'zhejiang',
    }[shortAreaName(province)];
    container.innerHTML = '<div id="mapchart" class="mychart" style="display:inline-block;width:100%;height:100%;"></div>';
    const cfg = await createMapChartConfig({mapName, data: records});
    const chart = echarts.init(document.getElementById('mapchart'));
    chart.setOption(cfg);

    if (mapName === 'china') {
        chart.on('click', (params) => {
            showMap(params.data.province);
        });
    }

    return [chart];
}

/**
 * 设置世界地图（世界地图和左侧条形图）
 * @param records   数据
 * @param container 显示容器
 */
async function setupWorldMapCharts(records, container) {
    const valueKey = mapDisplayMetrics === 'accum' ? 'confirmedCount' : 'insickCount';

    await prepareChartMap('world');

    container.innerHTML = '<div id="mapchart" class="mychart" style="display:inline-block;width:100%;height:100%;"></div>';

    records = records.sort((a, b) => a.confirmedCount < b.confirmedCount ? -1 : 1);

    const config = {
        title: {
            text: mapDisplayMetrics === 'accum' ? getTextForKey('当前显示累计确诊') : getTextForKey('当前显示现存确诊'),
            link: `javascript:switchMapMetrics("${mapDisplayMetrics === 'accum' ? 'current' : 'accum'}")`,
            target: 'self',
            bottom: '10',
            left: '10',
        },
        tooltip: {
            show: true,
            trigger: 'item',
        },
        visualMap: {
            type: 'piecewise',
            pieces: getVisualPieces('world'),
            seriesIndex: 4,
            right: 20,
        },
        xAxis: [
            {
                type: 'value',
                axisLine: {show: false,},
                axisTick: {show: false,},
                axisLabel: {show: false,},
                splitLine: {show: false,},
            }
        ],
        yAxis: [
            {
                type: 'category',
                axisLabel: {
                    show: true,
                    interval: 0,
                },
                axisTick: {show: false,},
                axisLine: {show: false,},
            }
        ],
        grid: [
            {
                top: 10,
                width: '100%',
                left: 10,
                containLabel: true
            },
        ],
        series: [
            ...generateMapSideBarChartConfig(records.filter(r => r.confirmedCount >= 5000)),
            {
                name: '',
                type: 'map',
                mapType: 'world',
                roam: true,
                tooltip: {
                    formatter: ({name, data}) => {
                        if (data) {
                            // const {name, country, /*value,*/ confirmed, dead, cured, insick, /*increased*/} = data;
                            // return `<b>${country} (${name})</b><br />${getTextForKey('累计确诊：')}${confirmed}<br />${getTextForKey('现存确诊：')}${insick}<br />${getTextForKey('治愈人数：')}${cured}<br />${getTextForKey('死亡人数：')}${dead}`;
                            const {name, country, record} = data;
                            return generateTooltip(`${country} (${name})`, record);
                        }
                        return `<b>${name}</b><br />${getTextForKey('暂无数据')}`;
                    },
                },
                data: records.map(r => {
                    return {
                        name: r.enName || r.name,
                        continent: r.continentName,
                        country: r.name,
                        value: r[valueKey],
                        record: r,
                        // confirmed: r.confirmedCount,
                        // dead: r.deadCount,
                        // cured: r.curedCount,
                        // insick: r.insickCount,
                        // label: {
                        //   show: true,
                        // }
                    };
                }),
            },
        ]
    };


    const chart = echarts.init(document.getElementById('mapchart'));
    chart.setOption(config);

    chart.on('click', (params) => {
        if (params.data && params.data.continent /*&& params.data.country !== '中国'*/) {
            showWorldTrends(params.data.continent, params.data.country);
        }
    });

    return [chart];
}

/**
 * 准备图表数据
 * @param name 图表名
 * @param type 类型
 */
async function prepareChartData(type = 'area', name = '') {
    showLoading();

    const dataList = await getData(type);

    allCharts.forEach(chart => {
        chart.clear();
        chart.dispose();
    })
    allCharts = [];

    document.getElementById(chartsContainerId).innerHTML = 'Loading...';

    let records = dataList;
    if (name) {
        if (type === 'area') {
            records = dataList.filter(v => v.name === name)[0].cityList;
        } else {
            records = dataList.map(d => {
                return {
                    day: d.day,
                    records: d.records.filter(p => p.name === name)[0].cityList,
                };
            });
        }
    }
    records.forEach(item => {
        item.showName = item.name;
    });

    return records;
}

/**
 * 设置锚点
 */
function updateHash(tab, province, city) {
    const tabConfig = modulesConfig[tab];
    let hash = '#tab=' + tab;
    if (province) {
        hash += `&${tabConfig.provinceKey || 'province'}=${encodeURIComponent(province)}`;
    }
    if (city) {
        hash += `&${tabConfig.cityKey || 'city'}=${encodeURIComponent(city)}`;
    }
    location.hash = hash;

    Object.values(allTabs).forEach(t => {
        const isCurTab = t.hasSubParam ? t.url === hash : t.tab === tab;
        const m = isCurTab ? 'addClass' : 'removeClass';
        $(t.el)[m]('active');
        if (t.isSubItem && isCurTab) {
            $(t.parent)[m]('active');
        }
    });

    showLoading(false);
}

/**
 * 根据设置显示图表
 * @param configs       设置
 * @param chartClass    图表类型
 */
function showChartsWithConfigs(configs, chartClass = 'summary-chart') {
    allCharts.forEach(c => {
        c.clear();
        c.dispose();
    });

    document.getElementById(chartsContainerId).innerHTML = configs.map((_, i) => {
        return `<div id="chart${i}" class="${chartClass}"></div>`;
    }).join('');

    allCharts = configs.map((cfg, i) => {
        const chart = echarts.init(document.getElementById(`chart${i}`));
        chart.setOption(cfg);
        return chart;
    });

    return allCharts;
}

/**
 * 显示省份趋势
 * @param name  省份
 * @param city  城市
 */
async function showProvince(name, city = '') {
    let records = await prepareChartData('area', name);
    if (name && city) {
        records = records.filter(c => c.name === city);
    }
    allCharts = setupTrendsCharts(records, document.getElementById(chartsContainerId));
    updateHash('trends', name, city);
}

/**
 * 显示世界趋势
 * @param continent 大陆
 * @param country   国家
 */
async function showWorldTrends(continent = '', country = '') {
    let records = await prepareChartData('world');
    if (continent && continent !== 'all') {
        records = records.filter(r => r.continentName === continent);
    }
    if (country) {
        records = records.filter(r => r.name === country);
    }
    allCharts = setupTrendsCharts(records, document.getElementById(chartsContainerId));
    updateHash('world-trends', continent, country);
}

/**
 * 显示地图(中国趋势->省市地图)
 * @param name 要显示的地图名
 */
async function showMap(name) {
    const records = await prepareChartData('date', name);
    allCharts = await setupMapCharts(records, document.getElementById(chartsContainerId), name);
    updateHash('map', name);
}

/**
 * 显示国家对比
 * @param metrics 对比的数据
 */
async function showCountriesCompare(metrics) {
    metrics = metrics || 'confirmed';
    const records = await prepareChartData('world');

    // 国家人口数
    const populations = {
        '中国': 1400050000,
        '印度': 1369380000,
        '美国': 329420000,
        '印尼': 268070000,
        '巴西': 211280000,
        '巴基斯坦': 208460000,
        '尼日利亚': 206360000,
        '孟加拉国': 170330000,
        '俄罗斯': 146670000,
        '墨西哥': 126580000,
        '日本': 125950000,
        '菲律宾': 108410000,
        '埃及': 100150000,
        '埃塞俄比亚': 98665000,
        '越南': 96209000,
        '刚果（金）': 89524000,
        '伊朗': 83301000,
        '土耳其': 83155000,
        '德国': 81465000,
        '英国': 66669000,
        '泰国': 66484000,
        '法国': 64903000,
        '坦桑尼亚': 61495000,
        '意大利': 60015000,
        '南非': 57225000,
        '缅甸': 56004000,
        '韩国': 51781000,
        '哥伦比亚': 49396000,
        '肯尼亚': 47899000,
        '西班牙': 47100000,
        '乌干达': 45422000,
        '阿根廷': 45377000,
        '阿尔及利亚': 43402000,
        '苏丹': 42434000,
        '乌克兰': 41902000,
        '伊拉克': 39128000,
        '波兰': 38386000,
        '加拿大': 37895000,
        '阿富汗': 37473000,
        '摩洛哥': 35852000,
        '沙特阿拉伯': 35178000,
        '乌兹别克斯坦': 33906000,
        '马来西亚': 32729000,
        '委内瑞拉': 32220000,
        '秘鲁': 32131000,
        '加纳': 30280000,
        '也门': 30268000,
        '莫桑比克': 30067000,
        '尼泊尔': 29898000,
        '安哥拉': 29164000,
        '马达加斯加': 26251000,
        '喀麦隆': 26245000,
        '科特迪瓦': 25823000,
        '朝鲜': 25791000,
        '澳大利亚': 25636000,
        '台湾': 23601000,
        '尼日尔': 22315000,
        '罗马尼亚': 22175000,
        '斯里兰卡': 21803000,
        '布基纳法索': 21510000,
        '马里': 20210000,
        '智利': 18874000,
        '哈萨克斯坦': 18654000,
        '危地马拉': 18011000,
        '赞比亚': 17885000,
        '马拉维': 17564000,
        '厄瓜多尔': 17460000,
        '荷兰': 17429000,
        '叙利亚': 16538000,
        '柬埔寨': 16524000,
        '乍得': 16245000,
        '塞内加尔': 16209000,
        '津巴布韦': 15160000,
        '南苏丹': 14945000,
        '几内亚': 12560000,
        '卢旺达': 12374000,
        '索马里': 12037000,
        '贝宁': 11884000,
        '海地': 11743000,
        '突尼斯': 11722000,
        '玻利维亚': 11588000,
        '比利时': 11476000,
        '布隆迪': 11216000,
        '古巴': 11210000,
        '希腊': 10725000,
        '捷克': 10694000,
        '约旦': 10610000,
        '多米尼加': 10448000,
        '瑞典': 10333000,
        '葡萄牙': 10277000,
        '阿塞拜疆': 10067000,
        '阿联酋': 10061000,
        '匈牙利': 9772800,
        '白俄罗斯': 9502000,
        '洪都拉斯': 9251300,
        '以色列': 9175500,
        '塔吉克斯坦': 9170000,
        '巴布亚新几内亚': 8935000,
        '奥地利': 8902600,
        '瑞士': 8586600,
        '塞拉利昂': 8100300,
        '多哥': 7706000,
        '香港': 7500700,
        '巴拉圭': 7252700,
        '老挝': 7013000,
        '塞尔维亚': 6963800,
        '保加利亚': 6942100,
        '黎巴嫩': 6933600,
        '尼加拉瓜': 6283200,
        '利比亚': 6277000,
        '吉尔吉斯斯坦': 6221600,
        '萨尔瓦多': 6175800,
        '新加坡': 6049000,
        '丹麦': 5844800,
        '阿曼': 5681000,
        '土库曼斯坦': 5567600,
        '厄立特里亚': 5548200,
        '芬兰': 5522600,
        '斯洛伐克': 5437300,
        '挪威': 5398600,
        '中非': 5170900,
        '巴勒斯坦': 5035200,
        '哥斯达黎加': 4961900,
        '刚果（布）': 4957700,
        '新西兰': 4844200,
        '利比里亚': 4839400,
        '爱尔兰': 4729200,
        '科威特': 4460500,
        '毛里塔尼亚': 4357300,
        '克罗地亚': 4198300,
        '巴拿马': 4112400,
        '摩尔多瓦': 4060300,
        '格鲁吉亚': 3858900,
        '波黑': 3797600,
        '波多黎各': 3667500,
        '乌拉圭': 3463600,
        '蒙古': 3200200,
        '亚美尼亚': 3048100,
        '阿尔巴尼亚': 2889700,
        '牙买加': 2823000,
        '立陶宛': 2745100,
        '纳米比亚': 2618200,
        '卡塔尔': 2563800,
        '博茨瓦纳': 2391700,
        '莱索托': 2207200,
        '冈比亚': 2176400,
        '马其顿': 2087600,
        '斯洛文尼亚': 2079800,
        '几内亚比绍': 1971700,
        '拉脱维亚': 1903900,
        '加蓬': 1836000,
        '科索沃': 1808500,
        '巴林': 1450600,
        '特立尼达和多巴哥': 1378700,
        '斯威士兰': 1342900,
        '爱沙尼亚': 1299100,
        '毛里求斯': 1287800,
        '东帝汶': 1261300,
        '塞浦路斯': 1201500,
        '吉布提': 921250,
        '赤道几内亚': 917000,
        '斐济': 910990,
        '科摩罗': 843030,
        '不丹': 807630,
        '圭亚那': 774630,
        '澳门': 672000,
        '黑山': 628080,
        '所罗门群岛': 618250,
        '阿拉伯撒哈拉民主共和国': 609540,
        '卢森堡': 603700,
        '苏里南': 557470,
        '佛得角': 537820,
        '文莱': 440920,
        '马耳他': 422610,
        '巴哈马': 404300,
        '马尔代夫': 382190,
        '伯利兹': 382120,
        '冰岛': 336040,
        '巴巴多斯': 286900,
        '瓦努阿图': 281820,
        '圣多美和普林西比': 202060,
        '萨摩亚': 197400,
        '圣卢西亚': 189470,
        '关岛': 175880,
        '泽西  根西': 166060,
        '库拉索': 159450,
        '基里巴斯': 118280,
        '圣文森特和格林纳丁斯': 109510,
        '格林纳达': 108020,
        '汤加': 107360,
        '美属维尔京群岛': 106190,
        '阿鲁巴': 105200,
        '密克罗尼西亚联邦': 104810,
        '塞舌尔': 98455,
        '安提瓜和巴布达': 94480,
        '马恩岛': 90136,
        '多米尼克': 73021,
        '安道尔': 72415,
        '开曼群岛': 64180,
        '百慕大': 63417,
        '美属萨摩亚': 57732,
        '圣基茨和尼维斯': 56769,
        '马绍尔群岛': 56435,
        '格陵兰': 56291,
        '法罗群岛': 48893,
        '北马里亚纳群岛': 47908,
        '荷属圣马丁': 42285,
        '列支敦士登': 38218,
        '特克斯和凯科斯群岛': 38110,
        '摩纳哥': 37522,
        '圣马力诺': 32790,
        '直布罗陀': 32397,
        '英属维尔京群岛': 31600,
        '帕劳': 21448,
        '库克群岛': 18669,
        '安圭拉': 15605,
        '瑙鲁': 10406,
        '图瓦卢': 10254,
        '蒙特塞拉特': 5224,
        '圣赫勒拿、阿森松和特里斯坦-达库尼亚': 4048,
        '福克兰群岛': 3198,
        '斯瓦尔巴和扬马延': 2800,
        '圣诞岛': 1928,
        '诺福克岛': 1756,
        '纽埃': 1520,
        '托克劳': 1400,
        '科科斯（基林）群岛': 538,
        '梵蒂冈': 453,
        '美国本土外小岛屿': 190,
    };

    // 主键
    const valueKey = {
        confirmed: 'confirmedCount',
        exists: 'insickCount',
        increase: 'confirmedIncreased',
        dead: 'deadCount',
        percent: 'confirmedPer1M',
        deadrate: 'deadRate',
    }[metrics] || 'confirmedCount';

    const title = getTextForKey('累计确诊 >= 500 国家') + ': ' + getTextForKey({
        confirmed: '累计确诊人数',
        exists: '现存确诊人数',
        increase: '新增确诊人数',
        dead: '累计死亡人数',
        percent: '每百万人口确诊人数',
        deadrate: '累计死亡率',
    }[metrics] || '累计确诊人数');

    // 设置显示类型（普通，指数）
    const valueType = ['confirmed', 'insickCount',].indexOf(metrics) > -1 ? 'log' : 'value';

    const ALIGN_CASES = 100;        // 疫情起始标志（自确诊100日起）
    const SHOW_MIN_CASES = 500;     // 图表中仅显示确诊人数大于此值的国家
    const SELECTED_MIN_CASES = 5000;// 折线仅显示确诊人数大于此值的国家
    let maxDays = 0;                // 疫情持续天数
    const data = records.filter(country => {
        // 筛选确诊人数大于SHOW_MIN_CASES的国家
        return !!country.name && country.confirmedCount >= SHOW_MIN_CASES;
    }).map(country => {
        // 筛选确诊人数大于ALIGN_CASES的日期
        country.records = country.records.filter(r => r.confirmedCount >= ALIGN_CASES);
        // 计算死亡率
        country.records.forEach((r, i) => {
            r.index = i;
            r.deadRate = Math.floor(r.deadCount / r.confirmedCount * 10000) / 100;
        });
        if (country.records.length > maxDays) {
            maxDays = country.records.length;
        }
        // 每百万人口确诊人数
        if (populations[country.name]) {
            country.records.forEach(v => {
                v.confirmedPer1M = Math.floor(v.confirmedCount / (populations[country.name] / 1000000) * 100) / 100;
            });
        }
        return country;
    });

    const formatTooltipLine = function (color) {
        return `<span style='display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${color};margin-right:5px;'></span>`;
    };

    const valueSuffix = valueKey.endsWith('Rate') ? '%' : '';

    const allConfigs = [
        {
            // 鼠标悬停提示
            tooltip: {
                trigger: 'axis',
                formatter: (params) => {
                    if (params && params.length > 0) {
                        return `<b>${params[0].name} days</b><small> since 100 cases</small><br />${params.map(v => {
                            const value = v.value ? `${v.value}${valueSuffix}` : '--';
                            return (`${formatTooltipLine(v.color)}${v.seriesName}：${value} <small>(${v.data.updateTime})</small>`);
                        }).join('<br />')}`;
                    }
                    return '';
                }
            },
            title: {
                text: title,
            },
            legend: {
                data: data.map(s => getLangProp(s)),
                textStyle: {
                    fontSize: 11,
                },
                bottom: 0,
                selected: data.reduce((p, v) => {
                    p[getLangProp(v)] = v.confirmedCount >= SELECTED_MIN_CASES;
                    return p;
                }, {}),
                selectedMode: 'multiple',
            },
            grid: {
                bottom: '15%',
            },
            xAxis: {
                type: 'category',
                data: new Array(maxDays).join(',').split(',').map((v, i) => i + 1),
            },
            yAxis: [
                {
                    type: valueType,
                },
            ],
            series: data.map(d => {
                return {
                    type: 'line',
                    name: getLangProp(d),
                    data: d.records.map((r, i) => {
                        return {
                            value: r[valueKey],
                            updateTime: r.updateTime,
                            label: {
                                formatter: `{a}: {c}${valueSuffix}`,
                                fontSize: 14,
                                backgroundColor: 'rgba(222,222,222,0.7)',
                                padding: 6,
                                borderRadius: 6,
                                show: i === d.records.length - 1,
                            },
                        };
                    }),
                    smooth: true,
                };
            })

        }
    ];
    document.getElementById(chartsContainerId).innerHTML = allConfigs.map((_, i) => {
        return `<div id="chart${i}" class="single-chart"></div>`;
    }).join('');

    allCharts = allConfigs.map((config, i) => {
        const chart = echarts.init(document.getElementById(`chart${i}`));
        chart.setOption(config);
        return chart;
    });

    updateHash('countries-compare', metrics);

}

/**
 * 显示所有城市地图（中国趋势->全部城市地图）
 */
async function showAllCitiesMap() {
    const zhiXiaShi = ['北京市', '重庆市', '上海市', '天津市'];
    const data = await prepareChartData('date')
    const records = data.map(d => {
        return {
            day: d.day,
            records: d.records.reduce((p, v) => {
                return p.concat(zhiXiaShi.indexOf(v.name) > -1 ? v : v.cityList);
            }, []),
        };
    });
    allCharts = await setupMapCharts(records, document.getElementById(chartsContainerId), '', true);
    updateHash('cities-map');
}

/**
 * 显示世界地图（世界地图）
 */
async function showWorldMap() {
    const data = await prepareChartData('country');
    allCharts = await setupWorldMapCharts(data, document.getElementById(chartsContainerId));
    updateHash('world-map');
}

/**
 * 国内统计信息（中国趋势->总体趋势）
 */
async function showSummary() {
    // [全国，湖北，非湖北，非湖北无新增确诊天数等数据]
    const allRecords = await prepareChartData('overall')
    // [全国，湖北，非湖北]
    const records = allRecords.slice(0, 3)
    // 数据：{updateTime: "上海", maxZeroIncrDays: 0, confirmedIncreased: 6, insickCount: 155}
    const [lastDay] = allRecords.slice(3)
    lastDay.records.forEach(item => {
        item.updateTime = shortAreaName(item.updateTime);
    })

    // 合成累计死亡治愈率数据
    const accumRateName = [getTextForKey('累计死亡率'), getTextForKey('累计治愈率')]
    const accumRate = ['deadRate', 'curedRate'].map((k, i) => {
        return {
            name: accumRateName[i],
            enName: accumRateName[i],
            // 数据：{updateTime: "1/24", countryRate: "2.90", nothubeiRate: "0.63", hubeiRate: "4.37"}
            records: records[0].records.map((v, i) => {
                return {
                    updateTime: v.updateTime,
                    countryRate: v[k],
                    nothubeiRate: records[1].records[i][k],
                    hubeiRate: records[2].records[i][k],
                };
            }),
        };
    });

    const configs = [
        // 全国、非湖北、湖北的趋势图
        ...records.map(item => {
            return createTrendsChartConfig(item);
        }),

        // 非湖北 无新增确诊天数
        ...[lastDay].map(item => {
            item = JSON.parse(JSON.stringify(item));
            item.records.sort((a, b) => a.maxZeroIncrDays > b.maxZeroIncrDays ? -1 : 1);
            const config = createRateTrendsChartConfig(item, [
                {name: getTextForKey('新增确诊'), key: 'confirmedIncreased'},
                {
                    name: getTextForKey('无新增确诊天数'),
                    key: 'maxZeroIncrDays',
                    config: {type: 'bar', itemStyle: {color: 'rgb(156,197,175)',},}
                },
            ], {
                xAxis: {
                    axisLabel: {
                        interval: 0,
                        rotate: 40,
                    }
                },
                yAxis: [{
                    type: 'value',
                }],
            });
            config.title[0].text += ' ' + getTextForKey('无新增确诊天数');
            return config;
        }),

        // 现存确诊
        ...[lastDay].map(item => {
            const config = createRateTrendsChartConfig(item, [
                {
                    name: getTextForKey('现存确诊'),
                    key: 'insickCount',
                    config: {type: 'bar', itemStyle: {color: 'rgb(156,197,175)',},}
                },
            ], {
                xAxis: {
                    axisLabel: {
                        interval: 0,
                        rotate: 40,
                    }
                },
                yAxis: [{
                    type: 'value',
                }],
            });
            config.title[0].text += ' ' + getTextForKey('现存确诊');
            return config;
        }),

        // 累计死亡率、治愈率
        ...accumRate.map(item => {
            return createRateTrendsChartConfig(item, [
                {name: getTextForKey('全国'), key: 'countryRate',},
                {name: getTextForKey('非湖北'), key: 'nothubeiRate',},
                {name: getTextForKey('湖北省'), key: 'hubeiRate',},
            ]);
        }),

        // 疑似变化、疑似检测/确诊、重症率
        ...[records[0], records[0], records[0]].map((item, i) => {
            const config = createRateTrendsChartConfig(item, [
                [
                    {name: getTextForKey('当前疑似'), key: 'suspectedCount',},
                    {name: getTextForKey('新增疑似'), key: 'suspectedIncreased', config: {type: 'bar', yAxisIndex: 1}},
                ],
                [
                    {name: getTextForKey('疑似确诊比例'), key: 'suspectedConfirmedRate',},
                    {name: getTextForKey('新增疑似'), key: 'suspectedIncreased', config: {type: 'line', yAxisIndex: 1}},
                    {name: getTextForKey('疑似检测'), key: 'suspectedDayProcessed', config: {type: 'bar', yAxisIndex: 1}},
                ],
                [
                    {name: getTextForKey('累计重症比例'), key: 'seriousRate',},
                    {
                        name: getTextForKey('累计重症'),
                        key: 'seriousCount',
                        config: {type: 'bar', yAxisIndex: 1, itemStyle: {color: 'rgb(156,197,175)',},}
                    },
                    {name: getTextForKey('新增重症'), key: 'seriousIncreased', config: {type: 'bar', yAxisIndex: 1}},
                ],
            ][i]);
            if (i === 0) {
                config.yAxis[0].axisLabel.formatter = '{value}';
            }
            config.title[0].text += ' ' + [getTextForKey('疑似变化'), getTextForKey('疑似检测/确诊'), getTextForKey('重症率')][i];
            return config;
        }),
    ];

    showChartsWithConfigs(configs)

    updateHash('summary')
}

/**
 * 无新增确诊天数（中国趋势->新增概览）
 */
async function showZeroDays() {
    const records = await prepareChartData('increase');

    const configs = records.map(v => {
        v.records.forEach(r => {
            r.updateTime = shortAreaName(r.updateTime);
        });
        return createRateTrendsChartConfig(v, [
            {name: getTextForKey('新增确诊'), key: 'confirmedIncreased'},
            {
                name: getTextForKey('无新增确诊天数'),
                key: 'maxZeroIncrDays',
                config: {type: 'bar', itemStyle: {color: 'rgb(156,197,175)',},}
            },
        ], {
            xAxis: {
                axisLabel: {
                    interval: 0,
                    rotate: 40,
                }
            },
            yAxis: [{
                type: 'value',
            }],
        });
    });

    showChartsWithConfigs(configs, 'trends-chart')

    updateHash('zerodays');
}

/**
 * 选项卡改变时进入不同地图
 */
function handleHashChanged() {
    if (typeof $ !== 'undefined' && $('#navbarSupportedContent').collapse) {
        $('#navbarSupportedContent').collapse('hide');
    }

    // 默认标签
    const defaultTab = 'world-map';
    const query = new URLSearchParams(location.hash.replace(/^#/, ''));
    const tab = query.get('tab') || defaultTab;
    let title = [document.querySelector('title').innerHTML.split(' - ')[0]];

    // 执行的方法
    const func = modulesConfig[tab] || modulesConfig[defaultTab];

    const province = query.get(func.provinceKey || 'province') || '';
    const city = query.get(func.cityKey || 'city') || '';

    func.func(province, city);
    title.push(allTabs[tab].title);
    if (func.supportProvince && province) {
        title.push(province);
    }

    document.querySelector('title').innerHTML = title.join(' - ');
}

async function main() {
    handleHashChanged();
    window.onhashchange = handleHashChanged;
}

main();