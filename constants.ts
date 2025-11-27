import { JobDefinition, ShiftType, Gender } from './types';

export const OPENING_JOBS: JobDefinition[] = [
  {
    id: 'op_wash',
    name: '洗东西',
    requiredCount: 1,
    isVariable: false,
    difficultyLevel: 1,
    genderConstraint: Gender.FEMALE, // Females excluded
    description: '清洗烤网、毛巾并摆放到指定位置'
  },
  {
    id: 'op_dining',
    name: '用餐区',
    requiredCount: 2,
    isVariable: false,
    difficultyLevel: 2,
    description: '桌面调料瓶、打卡广告牌、餐具摆放整齐'
  },
  {
    id: 'op_prep',
    name: '备餐',
    requiredCount: 2,
    isVariable: true,
    difficultyLevel: 3,
    description: '补黄油、茶水、生菜、冰淇淋、三味碟、饮料、前台零食糖果'
  },
  {
    id: 'op_seats',
    name: '座椅擦拭',
    requiredCount: 1,
    isVariable: false,
    difficultyLevel: 4,
    description: '擦拭桌子、木柱、灯牌、椅子、消毒柜，注意卫生死角'
  },
  {
    id: 'op_organize',
    name: '整理',
    requiredCount: 1,
    isVariable: false,
    difficultyLevel: 5,
    description: '筷子入套，整理剪刀夹子归位，洗完餐具入消毒柜'
  },
];

export const CLOSING_JOBS: JobDefinition[] = [
  {
    id: 'cl_pots',
    name: '洗锅圈',
    requiredCount: 2,
    isVariable: false,
    difficultyLevel: 1, // Most tired in closing
    description: '收洗放锅；热水洗洁精精洗锅圈死角；复位加水；擦亮金色部分'
  },
  {
    id: 'cl_floor_trash',
    name: '拖地/倒垃圾',
    requiredCount: 2,
    isVariable: true,
    difficultyLevel: 2,
    description: '先扫后拖，清理全店垃圾'
  },
  {
    id: 'cl_dining',
    name: '用餐区',
    requiredCount: 2,
    isVariable: true,
    difficultyLevel: 3,
    description: '擦拭调料瓶/广告牌/桌面/菜架；小菜入冰箱；洗烤网桶；擦电饭锅'
  },
  {
    id: 'cl_wash',
    name: '洗东西',
    requiredCount: 1,
    isVariable: true,
    difficultyLevel: 4,
    description: '洗杯子、茶壶；洗面包盒/黄油盒/托盘/小菜盒'
  },
];

export const JOB_TEMPLATES = {
  OPENING_HEADER: `【开市安排】
时间要求：11:00前必须完成`,
  CLOSING_HEADER: `【收市安排】
时间要求：22:00前必须完成`,
};