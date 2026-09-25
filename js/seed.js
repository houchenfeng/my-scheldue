(function(global) {
  'use strict';
  
  const SEED = {
    meta: {
      term: '2026—2027学年 第一学期',
      week1Monday: '2026-09-07',
      totalWeeks: 19
    },
    periods: [
      { n: 1, start: '08:00', end: '08:45' },
      { n: 2, start: '08:50', end: '09:35' },
      { n: 3, start: '09:50', end: '10:35' },
      { n: 4, start: '10:40', end: '11:25' },
      { n: 5, start: '11:30', end: '12:15' },
      { n: 6, start: '14:00', end: '14:45' },
      { n: 7, start: '14:50', end: '15:35' },
      { n: 8, start: '15:50', end: '16:35' },
      { n: 9, start: '16:40', end: '17:25' },
      { n: 10, start: '17:30', end: '18:15' },
      { n: 11, start: '19:00', end: '19:45' },
      { n: 12, start: '19:50', end: '20:35' },
      { n: 13, start: '20:40', end: '21:25' },
      { n: 14, start: '21:30', end: '22:15' }
    ],
    courses: [
      {
        code: 'D141011A03',
        name: '可靠性中的机器学习(博)',
        class: '1',
        campus: '学院路校区',
        unit: '011400 可靠性与系统工程学院',
        mode: '面授讲课',
        teacher: '刘杰',
        count: 178,
        firstDate: '2026-09-07',
        note: '线上上课',
        slots: [
          { wd: 1, p: [1, 2], weeks: [1, 9], loc: 'B118' }
        ]
      },
      {
        code: 'D411026B01',
        name: '人工智能安全与伦理',
        class: '01',
        campus: '学院路校区',
        unit: '014100 人工智能学院',
        mode: '全线上教学',
        teacher: '韦星星',
        count: 3078,
        firstDate: '',
        note: '线上上课',
        slots: []
      },
      {
        code: 'D571026C31',
        name: '科学研究与学术写作',
        class: '01',
        campus: '杭州国际创新研究院',
        unit: '015700 杭州国际创新研究院',
        mode: '面授讲课',
        teacher: '黄雪飞,张莹莹',
        count: 50,
        firstDate: '2026-09-11',
        note: '线下上课',
        slots: [
          { wd: 5, p: [2, 5], weeks: [1, 8], loc: '计算机房(R1-4093)' }
        ]
      },
      {
        code: 'T130032042',
        name: '物流运输模型与算法',
        class: '国新院班',
        campus: '杭州国际创新研究院',
        unit: '011300 交通科学与工程学院',
        mode: '面授讲课',
        teacher: '周宇',
        count: 29,
        firstDate: '2026-10-12',
        note: '线下上课',
        slots: [
          { wd: 1, p: [8, 9], weeks: [6, 11], loc: '教学一号楼3003' },
          { wd: 1, p: [10, 10], weeks: [6, 10], loc: '教学一号楼3003' },
          { wd: 2, p: [8, 10], weeks: [6, 10], loc: '教学一号楼3003' }
        ]
      }
    ]
  };
  
  global.SEED = SEED;
})(typeof window !== 'undefined' ? window : globalThis);
