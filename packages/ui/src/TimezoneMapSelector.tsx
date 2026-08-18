import { useState, useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { geoEquirectangular, geoPath, geoGraticule, geoCircle } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import worldData from 'world-atlas/countries-110m.json';
import { useTimezone, type TimezoneOption, type DstMode } from './TimezoneContext.js';
import { useTheme } from './ThemeContext.js';
import { Chip } from './Chip.js';
import { Button } from './Button.js';
import { IconCheck, IconSun, IconMoon } from './icons.js';

export interface CityTimezone extends TimezoneOption {
  lat: number;
  lon: number;
  country: string;
}

export const EXTENDED_CITIES: CityTimezone[] = [
  // 亚洲 (Asia)
  {
    id: 'Asia/Shanghai',
    name: '北京 / 上海 (中国标准时间 CST)',
    city: '上海',
    country: '中国',
    region: 'Asia',
    offsetHours: 8,
    offsetLabel: 'UTC+08:00',
    lat: 31.23,
    lon: 121.47,
    coords: { x: 837, y: 163 },
    hasDst: false,
    dstInfo: '不实行夏令时，全年恒定 UTC+8',
  },
  {
    id: 'Asia/Hong_Kong',
    name: '香港 (香港时间 HKT)',
    city: '香港',
    country: '中国香港',
    region: 'Asia',
    offsetHours: 8,
    offsetLabel: 'UTC+08:00',
    lat: 22.31,
    lon: 114.16,
    coords: { x: 817, y: 188 },
    hasDst: false,
    dstInfo: '不实行夏令时',
  },
  {
    id: 'Asia/Taipei',
    name: '台北 (台北时间 TST)',
    city: '台北',
    country: '中国台湾',
    region: 'Asia',
    offsetHours: 8,
    offsetLabel: 'UTC+08:00',
    lat: 25.03,
    lon: 121.56,
    coords: { x: 837, y: 180 },
    hasDst: false,
    dstInfo: '不实行夏令时',
  },
  {
    id: 'Asia/Tokyo',
    name: '东京 (日本标准时间 JST)',
    city: '东京',
    country: '日本',
    region: 'Asia',
    offsetHours: 9,
    offsetLabel: 'UTC+09:00',
    lat: 35.68,
    lon: 139.69,
    coords: { x: 888, y: 151 },
    hasDst: false,
    dstInfo: '不实行夏令时，全年恒定 UTC+9',
  },
  {
    id: 'Asia/Seoul',
    name: '首尔 (韩国标准时间 KST)',
    city: '首尔',
    country: '韩国',
    region: 'Asia',
    offsetHours: 9,
    offsetLabel: 'UTC+09:00',
    lat: 37.56,
    lon: 126.97,
    coords: { x: 852, y: 145 },
    hasDst: false,
    dstInfo: '不实行夏令时',
  },
  {
    id: 'Asia/Singapore',
    name: '新加坡 (新加坡时间 SGT)',
    city: '新加坡',
    country: '新加坡',
    region: 'Asia',
    offsetHours: 8,
    offsetLabel: 'UTC+08:00',
    lat: 1.35,
    lon: 103.81,
    coords: { x: 788, y: 246 },
    hasDst: false,
    dstInfo: '不实行夏令时',
  },
  {
    id: 'Asia/Bangkok',
    name: '曼谷 / 雅加达 (中南半岛时间 ICT)',
    city: '曼谷',
    country: '泰国',
    region: 'Asia',
    offsetHours: 7,
    offsetLabel: 'UTC+07:00',
    lat: 13.75,
    lon: 100.51,
    coords: { x: 779, y: 211 },
    hasDst: false,
    dstInfo: '不实行夏令时',
  },
  {
    id: 'Asia/Dubai',
    name: '迪拜 (海湾标准时间 GST)',
    city: '迪拜',
    country: '阿联酋',
    region: 'Asia',
    offsetHours: 4,
    offsetLabel: 'UTC+04:00',
    lat: 25.2,
    lon: 55.27,
    coords: { x: 653, y: 180 },
    hasDst: false,
    dstInfo: '不实行夏令时',
  },
  {
    id: 'Asia/Kolkata',
    name: '新德里 / 孟买 (印度标准时间 IST)',
    city: '新德里',
    country: '印度',
    region: 'Asia',
    offsetHours: 5.5,
    offsetLabel: 'UTC+05:30',
    lat: 28.61,
    lon: 77.2,
    coords: { x: 714, y: 170 },
    hasDst: false,
    dstInfo: '不实行夏令时',
  },

  // 欧洲 (Europe)
  {
    id: 'Europe/London',
    name: '伦敦 (格林威治 GMT / 英国夏令 BST)',
    city: '伦敦',
    country: '英国',
    region: 'Europe',
    offsetHours: 0,
    offsetLabel: 'UTC+00:00',
    lat: 51.5,
    lon: -0.12,
    coords: { x: 499, y: 107 },
    hasDst: true,
    dstInfo: '3月最后一个周日至10月最后一个周日实行夏令时 (BST, UTC+1)',
  },
  {
    id: 'Europe/Paris',
    name: '巴黎 (中欧时间 CET / CEST)',
    city: '巴黎',
    country: '法国',
    region: 'Europe',
    offsetHours: 1,
    offsetLabel: 'UTC+01:00',
    lat: 48.85,
    lon: 2.35,
    coords: { x: 506, y: 114 },
    hasDst: true,
    dstInfo: '夏季实行 CEST (UTC+2)，冬季恢复 CET (UTC+1)',
  },
  {
    id: 'Europe/Berlin',
    name: '柏林 / 罗马 (中欧时间 CET / CEST)',
    city: '柏林',
    country: '德国',
    region: 'Europe',
    offsetHours: 1,
    offsetLabel: 'UTC+01:00',
    lat: 52.52,
    lon: 13.4,
    coords: { x: 537, y: 104 },
    hasDst: true,
    dstInfo: '实行欧洲夏令时 CEST (UTC+2)',
  },
  {
    id: 'Europe/Moscow',
    name: '莫斯科 (莫斯科时间 MSK)',
    city: '莫斯科',
    country: '俄罗斯',
    region: 'Europe',
    offsetHours: 3,
    offsetLabel: 'UTC+03:00',
    lat: 55.75,
    lon: 37.61,
    coords: { x: 604, y: 95 },
    hasDst: false,
    dstInfo: '不实行夏令时，全年恒定 UTC+3',
  },

  // 美洲 (America)
  {
    id: 'America/New_York',
    name: '纽约 (东部时间 EST / EDT)',
    city: '纽约',
    country: '美国',
    region: 'America',
    offsetHours: -5,
    offsetLabel: 'UTC-05:00',
    lat: 40.71,
    lon: -74.0,
    coords: { x: 294, y: 137 },
    hasDst: true,
    dstInfo: '3月第二个周日至11月第一个周日实行夏令时 (EDT, UTC-4)',
  },
  {
    id: 'America/Chicago',
    name: '芝加哥 (中部时间 CST / CDT)',
    city: '芝加哥',
    country: '美国',
    region: 'America',
    offsetHours: -6,
    offsetLabel: 'UTC-06:00',
    lat: 41.87,
    lon: -87.62,
    coords: { x: 256, y: 133 },
    hasDst: true,
    dstInfo: '实行夏令时 (CDT, UTC-5)',
  },
  {
    id: 'America/Los_Angeles',
    name: '洛杉矶 / 旧金山 (太平洋时间 PST / PDT)',
    city: '洛杉矶',
    country: '美国',
    region: 'America',
    offsetHours: -8,
    offsetLabel: 'UTC-08:00',
    lat: 34.05,
    lon: -118.24,
    coords: { x: 171, y: 155 },
    hasDst: true,
    dstInfo: '实行夏令时 (PDT, UTC-7)',
  },
  {
    id: 'America/Toronto',
    name: '多伦多 (东部时间 EST / EDT)',
    city: '多伦多',
    country: '加拿大',
    region: 'America',
    offsetHours: -5,
    offsetLabel: 'UTC-05:00',
    lat: 43.65,
    lon: -79.38,
    coords: { x: 279, y: 128 },
    hasDst: true,
    dstInfo: '实行夏令时 (EDT, UTC-4)',
  },
  {
    id: 'America/Vancouver',
    name: '温哥华 (太平洋时间 PST / PDT)',
    city: '温哥华',
    country: '加拿大',
    region: 'America',
    offsetHours: -8,
    offsetLabel: 'UTC-08:00',
    lat: 49.28,
    lon: -123.12,
    coords: { x: 158, y: 113 },
    hasDst: true,
    dstInfo: '实行夏令时 (PDT, UTC-7)',
  },
  {
    id: 'America/Sao_Paulo',
    name: '圣保罗 (巴西利亚时间 BRT)',
    city: '圣保罗',
    country: '巴西',
    region: 'America',
    offsetHours: -3,
    offsetLabel: 'UTC-03:00',
    lat: -23.55,
    lon: -46.63,
    coords: { x: 370, y: 315 },
    hasDst: false,
    dstInfo: '目前已取消夏令时',
  },
  {
    id: 'America/Buenos_Aires',
    name: '布宜诺斯艾利斯 (阿根廷时间 ART)',
    city: '布宜诺斯艾利斯',
    country: '阿根廷',
    region: 'America',
    offsetHours: -3,
    offsetLabel: 'UTC-03:00',
    lat: -34.6,
    lon: -58.38,
    coords: { x: 337, y: 346 },
    hasDst: false,
    dstInfo: '不实行夏令时',
  },

  // 大洋洲 (Pacific / Oceania)
  {
    id: 'Australia/Sydney',
    name: '悉尼 / 墨尔本 (澳洲东部时间 AEST / AEDT)',
    city: '悉尼',
    country: '澳大利亚',
    region: 'Pacific',
    offsetHours: 10,
    offsetLabel: 'UTC+10:00',
    lat: -33.86,
    lon: 151.2,
    coords: { x: 920, y: 344 },
    hasDst: true,
    dstInfo: '10月第一个周日至次年4月第一个周日实行夏令时 (AEDT, UTC+11)',
  },
  {
    id: 'Pacific/Auckland',
    name: '奥克兰 (新西兰标准时间 NZST / NZDT)',
    city: '奥克兰',
    country: '新西兰',
    region: 'Pacific',
    offsetHours: 12,
    offsetLabel: 'UTC+12:00',
    lat: -36.84,
    lon: 174.76,
    coords: { x: 985, y: 352 },
    hasDst: true,
    dstInfo: '实行夏令时 (NZDT, UTC+13)',
  },

  // 非洲 (Africa)
  {
    id: 'Africa/Cairo',
    name: '开罗 (东欧标准时间 EET)',
    city: '开罗',
    country: '埃及',
    region: 'Africa',
    offsetHours: 2,
    offsetLabel: 'UTC+02:00',
    lat: 30.04,
    lon: 31.23,
    coords: { x: 586, y: 166 },
    hasDst: true,
    dstInfo: '4月最后一个周五至10月最后一个周四实行夏令时 (UTC+3)',
  },
  {
    id: 'Africa/Johannesburg',
    name: '约翰内斯堡 (南非标准时间 SAST)',
    city: '约翰内斯堡',
    country: '南非',
    region: 'Africa',
    offsetHours: 2,
    offsetLabel: 'UTC+02:00',
    lat: -26.2,
    lon: 28.04,
    coords: { x: 577, y: 322 },
    hasDst: false,
    dstInfo: '不实行夏令时',
  },
];

export function TimezoneMapSelector() {
  const { timezone, setTimezone, dstMode, setDstMode, timezoneInfo } = useTimezone();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [hoveredCity, setHoveredCity] = useState<CityTimezone | null>(null);
  const [mouseCoords, setMouseCoords] = useState<{
    x: number;
    y: number;
    lon: number;
    lat: number;
  } | null>(null);

  // 实时跳动时钟
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // 标准等矩投影：1000 x 500
  const projection = useMemo(() => {
    return geoEquirectangular()
      .scale(1000 / (2 * Math.PI))
      .translate([500, 250]);
  }, []);

  const pathGenerator = useMemo(() => {
    return geoPath().projection(projection);
  }, [projection]);

  // 从 world-atlas 权威 TopoJSON 解析出完整的陆地轮廓与国家边界
  const { landPath, bordersPath, graticulePath } = useMemo(() => {
    const rawTopo = worldData as unknown as Parameters<typeof feature>[0] & {
      objects: {
        land: Parameters<typeof feature>[1];
        countries: Parameters<typeof mesh>[1];
      };
    };
    const landGeo = feature(rawTopo, rawTopo.objects.land);
    const bordersGeo = mesh(rawTopo, rawTopo.objects.countries, (a, b) => a !== b);
    const graticuleGeo = geoGraticule()();

    return {
      landPath: pathGenerator(landGeo) || '',
      bordersPath: pathGenerator(bordersGeo) || '',
      graticulePath: pathGenerator(graticuleGeo) || '',
    };
  }, [pathGenerator]);

  // 计算当前天文晨昏线 / 昼夜交界 (Solar Terminator)
  const { daylightPath, sunPosition } = useMemo(() => {
    const utcHours =
      currentTime.getUTCHours() +
      currentTime.getUTCMinutes() / 60 +
      currentTime.getUTCSeconds() / 3600;
    const subsolarLon = -((utcHours - 12) * 15);

    const startOfYear = new Date(Date.UTC(currentTime.getUTCFullYear(), 0, 0));
    const diff = currentTime.getTime() - startOfYear.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));

    const sunCircle = geoCircle().center([subsolarLon, declination]).radius(90)();
    const pos = projection([subsolarLon, declination]) || [500, 250];

    return {
      daylightPath: pathGenerator(sunCircle) || '',
      sunPosition: { x: pos[0], y: pos[1] },
    };
  }, [currentTime, projection, pathGenerator]);

  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === 'dark';

  const mapTheme = useMemo(() => {
    return isDark
      ? {
          wrapperBg: 'bg-[#0c1222]',
          oceanFill: '#0f172a',
          oceanGridStroke: '#38bdf8',
          oceanGridOpacity: 0.05,
          graticuleStroke: '#94a3b8',
          graticuleOpacity: 0.12,
          equatorStroke: '#94a3b8',
          equatorOpacity: 0.25,
          daylightFill: '#38bdf8',
          daylightOpacity: 0.08,
          daylightFilter: 'drop-shadow(0 0 15px rgba(56, 189, 248, 0.15))',
          landFill: '#1e293b',
          landStroke: '#334155',
          landFilter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
          bordersStroke: '#475569',
          bordersOpacity: 0.4,
          sunGlowStart: '#fde047',
          sunGlowEnd: '#f59e0b',
          sunCenterFill: '#fde047',
          sunCenterStroke: '#f59e0b',
          cityRingStroke: '#0f172a',
          cityHoverFill: '#ffffff',
          cityUnselectedFill: '#94a3b8',
          cityLabelFill: '#f1f5f9',
          tooltipClass: 'bg-slate-900/95 border-slate-700 text-white',
          coordBadgeClass: 'bg-slate-900/80 border-slate-700/60 text-slate-300',
        }
      : {
          wrapperBg: 'bg-[#e4edf7]',
          oceanFill: '#e4edf7',
          oceanGridStroke: '#0284c7',
          oceanGridOpacity: 0.06,
          graticuleStroke: '#64748b',
          graticuleOpacity: 0.18,
          equatorStroke: '#475569',
          equatorOpacity: 0.3,
          daylightFill: '#ffffff',
          daylightOpacity: 0.5,
          daylightFilter: 'drop-shadow(0 0 20px rgba(255, 255, 255, 0.9))',
          landFill: '#ffffff',
          landStroke: '#cbd5e1',
          landFilter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.06))',
          bordersStroke: '#cbd5e1',
          bordersOpacity: 0.85,
          sunGlowStart: '#fbbf24',
          sunGlowEnd: '#f59e0b',
          sunCenterFill: '#f59e0b',
          sunCenterStroke: '#d97706',
          cityRingStroke: '#ffffff',
          cityHoverFill: '#0f172a',
          cityUnselectedFill: '#64748b',
          cityLabelFill: '#0f172a',
          tooltipClass: 'bg-surface/95 border-line text-ink',
          coordBadgeClass: 'bg-surface/90 border-line text-secondary',
        };
  }, [isDark]);

  const selectedCity = useMemo(
    () => EXTENDED_CITIES.find((t) => t.id === timezone) || EXTENDED_CITIES[0]!,
    [timezone],
  );

  // 格式化当前时区时间
  const localTimeFormatted = useMemo(() => {
    try {
      const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const dateGen = new Intl.DateTimeFormat('zh-CN', {
        timeZone: timezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });
      return {
        time: formatter.format(currentTime),
        date: dateGen.format(currentTime),
      };
    } catch {
      return {
        time: currentTime.toLocaleTimeString(),
        date: currentTime.toLocaleDateString(),
      };
    }
  }, [timezone, currentTime]);

  // UTC 国际时间
  const utcTimeFormatted = useMemo(() => {
    return {
      time: currentTime.toISOString().slice(11, 19),
      date: currentTime.toISOString().slice(0, 10),
    };
  }, [currentTime]);

  // 点击地图任意位置智能识别最近时区枢纽城市
  function handleMapClick(e: MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 1000;
    const clickY = ((e.clientY - rect.top) / rect.height) * 500;

    const inverted = projection.invert?.([clickX, clickY]);
    if (!inverted) return;
    const [clickLon, clickLat] = inverted;

    // 计算球面大圆距离与屏幕距离找到最近城市
    let closestCity = EXTENDED_CITIES[0]!;
    let minDistance = Infinity;

    for (const c of EXTENDED_CITIES) {
      const dLon = ((c.lon - clickLon) * Math.PI) / 180;
      const dLat = ((c.lat - clickLat) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((clickLat * Math.PI) / 180) *
          Math.cos((c.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const cDist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      if (cDist < minDistance) {
        minDistance = cDist;
        closestCity = c;
      }
    }

    if (closestCity) {
      setTimezone(closestCity.id);
    }
  }

  // 鼠标在地图上移动时计算时区条带与十字瞄准指示
  function handleMouseMove(e: MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 500;
    const inverted = projection.invert?.([x, y]);
    if (inverted) {
      setMouseCoords({ x, y, lon: inverted[0], lat: inverted[1] });
    }
  }

  // 计算当前选定时区的垂直经度带
  const activeTimezoneBand = useMemo(() => {
    const centerLon = selectedCity.offsetHours * 15;
    const centerPt = projection([centerLon, 0]) || [500, 250];
    const centerX = centerPt[0];
    const bandWidth = 1000 / 24;
    return {
      x: centerX - bandWidth / 2,
      width: bandWidth,
      centerX,
    };
  }, [selectedCity, projection]);

  // 过滤列表
  const filteredTimezones = useMemo(() => {
    return EXTENDED_CITIES.filter((tz) => {
      const matchRegion = selectedRegion === 'all' || tz.region === selectedRegion;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        tz.name.toLowerCase().includes(q) ||
        tz.city.toLowerCase().includes(q) ||
        tz.country.toLowerCase().includes(q) ||
        tz.id.toLowerCase().includes(q) ||
        tz.offsetLabel.toLowerCase().includes(q);
      return matchRegion && matchQuery;
    });
  }, [searchQuery, selectedRegion]);

  return (
    <div className="space-y-6">
      {/* 1. 顶部控制台：当前时区与双核时钟仪表盘 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 当前选中时区卡片 */}
        <div className="lg:col-span-2 rounded-panel border border-accent/40 bg-accent-soft/30 p-5 shadow-xs relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-3 rounded-full bg-accent animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-accent">
                  当前工作区生效时区
                </span>
              </div>
              <h3 className="mt-1.5 text-xl font-extrabold text-ink">{selectedCity.name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>
                  标识：<code>{selectedCity.id}</code>
                </span>
                <span>•</span>
                <span className="font-semibold text-secondary">{selectedCity.offsetLabel}</span>
                <span>•</span>
                <span>
                  坐标：{Math.abs(selectedCity.lat).toFixed(1)}°{selectedCity.lat >= 0 ? 'N' : 'S'},{' '}
                  {Math.abs(selectedCity.lon).toFixed(1)}°{selectedCity.lon >= 0 ? 'E' : 'W'}
                </span>
              </div>
            </div>

            {/* 本地实时大时钟 */}
            <div className="rounded-control bg-surface border border-line p-3 text-right shadow-2xs">
              <div className="text-2xl font-black tracking-tight text-ink font-mono">
                {localTimeFormatted.time}
              </div>
              <div className="text-[11px] font-medium text-muted mt-0.5">
                {localTimeFormatted.date}
              </div>
            </div>
          </div>

          {/* 夏令时 / 冬令时状态指示 */}
          <div className="mt-4 pt-3 border-t border-line/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              {selectedCity.hasDst ? (
                timezoneInfo.isDstNow ? (
                  <Chip tone="warning" icon={<IconSun size={12} />}>
                    当前处于夏令时 (DST +1h)
                  </Chip>
                ) : (
                  <Chip tone="neutral" icon={<IconMoon size={12} />}>
                    当前处于冬令时 (标准时间)
                  </Chip>
                )
              ) : (
                <Chip tone="good" icon={<IconCheck size={12} />}>
                  全年无夏令时 (固定时区)
                </Chip>
              )}
              <span className="text-muted text-[11px]">{selectedCity.dstInfo}</span>
            </div>

            {timezone !== 'Asia/Shanghai' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTimezone('Asia/Shanghai')}
                className="text-xs text-accent hover:underline"
              >
                重置为默认上海时区 (UTC+8)
              </Button>
            )}
          </div>
        </div>

        {/* UTC 国际基准时间卡片 */}
        <div className="rounded-panel border border-line bg-surface p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-muted uppercase tracking-wider">
                UTC 国际协调基准
              </div>
              <Chip tone="neutral">零时区基准</Chip>
            </div>
            <div className="mt-3 text-2xl font-black text-ink font-mono">
              {utcTimeFormatted.time} <span className="text-xs font-normal text-muted">UTC</span>
            </div>
            <div className="text-xs text-muted mt-1">{utcTimeFormatted.date}</div>
          </div>

          <div className="mt-3 rounded-control bg-surface-2 p-2.5 text-[11px] text-secondary leading-relaxed border border-line/50">
            💡 <strong>时区设置说明</strong>
            ：切换时区将即时更新全站时间显示，所有定时排程与日程数据均按对应时区精确对齐。
          </div>
        </div>
      </div>

      {/* 2. 交互式世界时区地图 */}
      <div className="rounded-panel border border-line bg-surface p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-ink">全球时区交互地图</h4>
            <p className="text-xs text-muted">
              点击地图任意区域或选择城市以设定时区，实时呈现全球昼夜晨昏分布
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span>当前时区：</span>
            <strong className="text-accent">
              {selectedCity.offsetLabel} ({selectedCity.city})
            </strong>
          </div>
        </div>

        {/* SVG 地图画板 */}
        <div
          className={`relative w-full aspect-[2/1] max-h-[460px] rounded-control ${mapTheme.wrapperBg} border border-line overflow-hidden select-none shadow-inner cursor-crosshair transition-colors duration-300`}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 1000 500"
            className="w-full h-full"
            onClick={handleMapClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => {
              setMouseCoords(null);
              setHoveredCity(null);
            }}
          >
            <defs>
              {/* 海洋经纬网图案 */}
              <pattern
                id="worldOceanGrid"
                width="41.666"
                height="41.666"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 41.666 0 L 0 0 0 41.666"
                  fill="none"
                  stroke={mapTheme.oceanGridStroke}
                  strokeOpacity={mapTheme.oceanGridOpacity}
                  strokeWidth="1"
                />
              </pattern>

              {/* 选定时区垂直光柱渐变 */}
              <linearGradient id="tzBeam" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
                <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.4" />
              </linearGradient>

              {/* 太阳光辉渐变 */}
              <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={mapTheme.sunGlowStart} stopOpacity="0.9" />
                <stop offset="40%" stopColor={mapTheme.sunGlowEnd} stopOpacity="0.4" />
                <stop offset="100%" stopColor={mapTheme.sunGlowEnd} stopOpacity="0" />
              </radialGradient>

              {/* 城市脉冲光圈径向渐变 */}
              <radialGradient id="cityGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.85" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* 1. 背景海洋与坐标经纬网 */}
            <rect width="1000" height="500" fill={mapTheme.oceanFill} />
            <rect width="1000" height="500" fill="url(#worldOceanGrid)" />

            {/* 经纬线网 (Graticule) */}
            <path
              d={graticulePath}
              fill="none"
              stroke={mapTheme.graticuleStroke}
              strokeOpacity={mapTheme.graticuleOpacity}
              strokeWidth="0.75"
            />

            {/* 赤道与本初子午线高亮 */}
            <line
              x1="0"
              y1="250"
              x2="1000"
              y2="250"
              stroke={mapTheme.equatorStroke}
              strokeOpacity={mapTheme.equatorOpacity}
              strokeWidth="1"
            />
            <line
              x1="500"
              y1="0"
              x2="500"
              y2="500"
              stroke={mapTheme.equatorStroke}
              strokeOpacity={mapTheme.equatorOpacity}
              strokeWidth="1"
            />

            {/* 2. 真实天文昼半球光照区域 (Daylight Hemisphere) */}
            <path
              d={daylightPath}
              fill={mapTheme.daylightFill}
              fillOpacity={mapTheme.daylightOpacity}
              style={{ filter: mapTheme.daylightFilter }}
            />

            {/* 3. 选定时区垂直高亮光柱 */}
            <g className="transition-all duration-300 pointer-events-none">
              <rect
                x={activeTimezoneBand.x}
                y={0}
                width={activeTimezoneBand.width}
                height={500}
                fill="url(#tzBeam)"
              />
              <line
                x1={activeTimezoneBand.x}
                y1={0}
                x2={activeTimezoneBand.x}
                y2={500}
                stroke="var(--accent)"
                strokeOpacity="0.5"
                strokeWidth="1"
              />
              <line
                x1={activeTimezoneBand.x + activeTimezoneBand.width}
                y1={0}
                x2={activeTimezoneBand.x + activeTimezoneBand.width}
                y2={500}
                stroke="var(--accent)"
                strokeOpacity="0.5"
                strokeWidth="1"
              />
            </g>

            {/* 4. 官方权威 Natural Earth 110m 真实高精度陆地轮廓 */}
            <path
              d={landPath}
              fill={mapTheme.landFill}
              stroke={mapTheme.landStroke}
              strokeWidth="0.9"
              style={{ filter: mapTheme.landFilter }}
              className="transition-colors duration-150"
            />

            {/* 5. 国家边界网 (National Borders) */}
            <path
              d={bordersPath}
              fill="none"
              stroke={mapTheme.bordersStroke}
              strokeOpacity={mapTheme.bordersOpacity}
              strokeWidth="0.6"
              strokeDasharray="2 2"
            />

            {/* 6. 实时直射太阳指示符 (Subsolar Point) */}
            <g
              transform={`translate(${sunPosition.x}, ${sunPosition.y})`}
              className="pointer-events-none"
            >
              <circle r={26} fill="url(#sunGlow)" />
              <circle
                r={4.5}
                fill={mapTheme.sunCenterFill}
                stroke={mapTheme.sunCenterStroke}
                strokeWidth="1.5"
              />
            </g>

            {/* 7. 选定时区中心经线指示虚线 */}
            <line
              x1={activeTimezoneBand.centerX}
              y1={0}
              x2={activeTimezoneBand.centerX}
              y2={500}
              stroke="var(--accent)"
              strokeDasharray="3 3"
              strokeOpacity="0.75"
              strokeWidth="1.5"
            />

            {/* 8. 全球主要枢纽城市光标与脉冲波纹 */}
            {EXTENDED_CITIES.map((tz) => {
              const pos = projection([tz.lon, tz.lat]) || [tz.coords.x, tz.coords.y];
              const x = pos[0];
              const y = pos[1];
              const isSelected = tz.id === timezone;
              const isHovered = hoveredCity?.id === tz.id;

              return (
                <g
                  key={tz.id}
                  className="cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTimezone(tz.id);
                  }}
                  onMouseEnter={() => setHoveredCity(tz)}
                  onMouseLeave={() => setHoveredCity(null)}
                >
                  {/* 选中城市的定位光晕与双层同心焦点环 */}
                  {isSelected && (
                    <>
                      <circle cx={x} cy={y} r={14} fill="url(#cityGlow)" />
                      <circle
                        cx={x}
                        cy={y}
                        r={9.5}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={1.5}
                        strokeOpacity={0.6}
                      />
                    </>
                  )}

                  {/* 悬浮/选中外圈 */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 6.5 : isHovered ? 6 : 3.5}
                    className="transition-all duration-200"
                    style={{
                      fill: isSelected
                        ? 'var(--accent)'
                        : isHovered
                          ? mapTheme.cityHoverFill
                          : mapTheme.cityUnselectedFill,
                      stroke: isSelected || isHovered ? mapTheme.cityRingStroke : 'none',
                      strokeWidth: isSelected || isHovered ? 2 : 0,
                    }}
                  />

                  {/* 中心白核 */}
                  {isSelected && <circle cx={x} cy={y} r={2.5} className="fill-white" />}

                  {/* 城市文字标签 */}
                  {(isSelected || isHovered || tz.id === 'Asia/Shanghai') && (
                    <text
                      x={x}
                      y={y - 9}
                      textAnchor="middle"
                      style={{ fill: isSelected ? 'var(--accent)' : mapTheme.cityLabelFill }}
                      className={`text-[10px] select-none pointer-events-none transition-all duration-150 ${
                        isSelected ? 'text-[11px] font-extrabold' : 'text-[10px] font-semibold'
                      }`}
                    >
                      {tz.city}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 9. 鼠标悬浮时的动态十字瞄准线 */}
            {mouseCoords && (
              <g className="pointer-events-none opacity-50">
                <line
                  x1={mouseCoords.x}
                  y1={0}
                  x2={mouseCoords.x}
                  y2={500}
                  stroke="var(--accent)"
                  strokeWidth="1"
                />
                <line
                  x1={0}
                  y1={mouseCoords.y}
                  x2={1000}
                  y2={mouseCoords.y}
                  stroke="var(--accent)"
                  strokeWidth="1"
                />
              </g>
            )}
          </svg>

          {/* 悬浮时区快速提示框 */}
          {hoveredCity && (
            <div
              className={`absolute pointer-events-none backdrop-blur-md rounded-control p-2.5 shadow-xl text-xs z-20 transition-all animate-fade-in border ${mapTheme.tooltipClass}`}
              style={{
                left: Math.min(
                  Math.max(
                    (projection([hoveredCity.lon, hoveredCity.lat])?.[0] || hoveredCity.coords.x) -
                      70,
                    10,
                  ),
                  820,
                ),
                top: Math.min(
                  Math.max(
                    (projection([hoveredCity.lon, hoveredCity.lat])?.[1] || hoveredCity.coords.y) +
                      14,
                    10,
                  ),
                  400,
                ),
              }}
            >
              <div className="font-bold">{hoveredCity.name}</div>
              <div className="text-[11px] text-accent font-semibold mt-0.5">
                {hoveredCity.country} · {hoveredCity.offsetLabel} · 点击立即切换
              </div>
            </div>
          )}

          {/* 右下角鼠标实时经纬度坐标微标 */}
          {mouseCoords && (
            <div
              className={`absolute bottom-2 right-2 pointer-events-none backdrop-blur-xs border px-2 py-0.5 rounded text-[10px] font-mono ${mapTheme.coordBadgeClass}`}
            >
              {Math.abs(mouseCoords.lat).toFixed(1)}°{mouseCoords.lat >= 0 ? 'N' : 'S'},{' '}
              {Math.abs(mouseCoords.lon).toFixed(1)}°{mouseCoords.lon >= 0 ? 'E' : 'W'}
            </div>
          )}
        </div>
      </div>

      {/* 3. 时区选择列表与夏令时策略配置 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* 左侧：时区筛选与选择列表 */}
        <div className="md:col-span-2 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-ink">全部支持时区 ({EXTENDED_CITIES.length})</h4>

            {/* 区域快捷过滤 */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {[
                { id: 'all', label: '全部' },
                { id: 'Asia', label: '亚洲' },
                { id: 'Europe', label: '欧洲' },
                { id: 'America', label: '美洲' },
                { id: 'Pacific', label: '大洋洲' },
                { id: 'Africa', label: '非洲' },
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRegion(r.id)}
                  className={`rounded-control px-2.5 py-1 text-xs font-semibold transition ${
                    selectedRegion === r.id
                      ? 'bg-accent text-white'
                      : 'bg-surface-2 text-secondary hover:text-ink'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* 搜索框 */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索时区、城市、国家或偏移量 (如 上海, 伦敦, 纽约, 东京, UTC+8)..."
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-hidden"
          />

          {/* 时区卡片列表 */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-h-72 overflow-y-auto pr-1">
            {filteredTimezones.map((tz) => {
              const isSelected = tz.id === timezone;
              return (
                <button
                  key={tz.id}
                  type="button"
                  onClick={() => setTimezone(tz.id)}
                  className={`flex items-center justify-between rounded-control border p-3 text-left transition-all ${
                    isSelected
                      ? 'border-accent bg-accent-soft/40 shadow-2xs ring-1 ring-accent/30'
                      : 'border-line bg-surface hover:bg-surface-2/60 hover:border-line'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs text-ink">{tz.name}</div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {tz.country} • {tz.offsetLabel} {tz.hasDst && '• 含夏令时'}
                    </div>
                  </div>

                  {isSelected && (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                      <IconCheck size={12} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 右侧：夏令时与冬令时 (DST) 选项策略 */}
        <div className="rounded-panel border border-line bg-surface p-4 shadow-2xs space-y-4">
          <div>
            <h4 className="text-sm font-bold text-ink">夏令时 (DST) 偏好</h4>
            <p className="text-xs text-muted mt-0.5">控制具有夏令时时区的时钟偏移计算规则</p>
          </div>

          <div className="space-y-2">
            {[
              {
                id: 'auto' as DstMode,
                title: '自动识别 (推荐)',
                desc: '按天文学与国际标准日期自动在夏/冬令时之间平滑切换',
              },
              {
                id: 'standard' as DstMode,
                title: '固定标准时间 (冬令时)',
                desc: '强制关闭夏令时，全年按冬令时偏移量计算',
              },
              {
                id: 'daylight' as DstMode,
                title: '固定夏令时间 (夏令时)',
                desc: '强制开启夏令时，时钟恒定提前 1 小时',
              },
            ].map((opt) => {
              const isSelected = dstMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDstMode(opt.id)}
                  className={`flex w-full flex-col items-start rounded-control border p-2.5 text-left transition ${
                    isSelected
                      ? 'border-accent bg-accent-soft/40 ring-1 ring-accent/30'
                      : 'border-line bg-surface-2/40 hover:bg-surface-2'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs font-bold text-ink">{opt.title}</span>
                    {isSelected && <IconCheck size={13} className="text-accent" />}
                  </div>
                  <span className="text-[11px] text-muted mt-1 leading-snug">{opt.desc}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-line text-[11px] text-muted leading-relaxed">
            无论切换至哪个时区，日程与排程时间均按对应时区精确对齐，保证多设备与跨时区体验一致。
          </div>
        </div>
      </div>
    </div>
  );
}
