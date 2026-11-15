export type Material = 'wood' | 'stone' | 'fabric' | 'seed';
export const materials: Material[] = ['wood', 'stone', 'fabric', 'seed'];
type Cost = Partial<Record<Material, number>>;
export type CatalogEntry = { id: string; name: string; kind: 'furniture' | 'building'; cost: Cost; footprint: [number, number]; tags: string[] };

export const catalog: CatalogEntry[] = [
  { id: 'bench', name: '여행 벤치', kind: 'furniture', cost: { wood: 4, stone: 1 }, footprint: [1, 1], tags: ['seat'] },
  { id: 'flowerbed', name: '꽃 화단', kind: 'furniture', cost: { wood: 2, stone: 2, seed: 2 }, footprint: [1, 1], tags: ['garden'] },
  { id: 'lamp', name: '종이 등불', kind: 'furniture', cost: { wood: 2, stone: 2, fabric: 1 }, footprint: [1, 1], tags: ['light'] },
  { id: 'table', name: '나무 탁자', kind: 'furniture', cost: { wood: 3, stone: 1 }, footprint: [1, 1], tags: ['table'] },
  { id: 'stool', name: '작은 의자', kind: 'furniture', cost: { wood: 2 }, footprint: [1, 1], tags: ['seat'] },
  { id: 'rug', name: '보자기 깔개', kind: 'furniture', cost: { fabric: 3 }, footprint: [1, 1], tags: ['cozy'] },
  { id: 'bookshelf', name: '여행 책장', kind: 'furniture', cost: { wood: 4, fabric: 1 }, footprint: [1, 1], tags: ['reading'] },
  { id: 'planter', name: '화분', kind: 'furniture', cost: { wood: 1, stone: 1, seed: 2 }, footprint: [1, 1], tags: ['garden'] },
  { id: 'well', name: '돌 우물', kind: 'furniture', cost: { stone: 5, wood: 2 }, footprint: [1, 1], tags: ['water'] },
  { id: 'mailbox', name: '편지함', kind: 'furniture', cost: { wood: 2, fabric: 1 }, footprint: [1, 1], tags: ['post'] },
  { id: 'signpost', name: '길 표지판', kind: 'furniture', cost: { wood: 2 }, footprint: [1, 1], tags: ['travel'] },
  { id: 'lantern', name: '천 랜턴', kind: 'furniture', cost: { wood: 1, stone: 1, fabric: 2 }, footprint: [1, 1], tags: ['light'] },
  { id: 'fountain', name: '작은 분수', kind: 'furniture', cost: { stone: 6, seed: 1 }, footprint: [1, 1], tags: ['water'] },
  { id: 'picnic_mat', name: '소풍 돗자리', kind: 'furniture', cost: { fabric: 4, seed: 1 }, footprint: [1, 1], tags: ['cozy'] },
  { id: 'swing', name: '나무 그네', kind: 'furniture', cost: { wood: 4, fabric: 2 }, footprint: [1, 1], tags: ['play'] },
  { id: 'hammock', name: '해먹', kind: 'furniture', cost: { wood: 3, fabric: 3 }, footprint: [1, 1], tags: ['rest'] },
  { id: 'cart', name: '여행 손수레', kind: 'furniture', cost: { wood: 5, stone: 1 }, footprint: [1, 1], tags: ['travel'] },
  { id: 'bike_rack', name: '자전거 거치대', kind: 'furniture', cost: { wood: 2, stone: 3 }, footprint: [1, 1], tags: ['travel'] },
  { id: 'telescope', name: '별 관측경', kind: 'furniture', cost: { wood: 2, stone: 2, fabric: 1 }, footprint: [1, 1], tags: ['star'] },
  { id: 'birdhouse', name: '새 집', kind: 'furniture', cost: { wood: 2, seed: 1 }, footprint: [1, 1], tags: ['garden'] },
  { id: 'windmill', name: '작은 풍차', kind: 'furniture', cost: { wood: 4, fabric: 2 }, footprint: [1, 1], tags: ['wind'] },
  { id: 'fence', name: '마을 울타리', kind: 'furniture', cost: { wood: 2 }, footprint: [1, 1], tags: ['garden'] },
  { id: 'bridge', name: '나무 다리', kind: 'furniture', cost: { wood: 4, stone: 2 }, footprint: [1, 1], tags: ['travel'] },
  { id: 'flower_arch', name: '꽃 아치', kind: 'furniture', cost: { wood: 3, seed: 3 }, footprint: [1, 1], tags: ['garden'] },
  { id: 'workshop', name: '작업장', kind: 'building', cost: { wood: 10, stone: 8, fabric: 2 }, footprint: [2, 2], tags: ['craft'] },
  { id: 'cottage', name: '주민 집', kind: 'building', cost: { wood: 12, stone: 6, fabric: 4 }, footprint: [2, 2], tags: ['home'] },
  { id: 'tea_house', name: '찻집', kind: 'building', cost: { wood: 10, stone: 10, fabric: 6, seed: 2 }, footprint: [2, 2], tags: ['social'] },
];

export const recipes = Object.fromEntries(catalog.map(entry => [entry.id, entry.cost])) as Record<string, Cost>;
export const catalogById = new Map(catalog.map(entry => [entry.id, entry]));

export type Quest = {
  id: string; name: string; description: string; requires?: string;
  condition: { kind: 'placed' | 'garden_days' | 'distinct_items'; value: string | number };
  reward: { materials?: Cost; resident?: 'todam' | 'saemi'; gridSize?: 16 | 20 };
};

export const quests: Quest[] = [
  { id: 'q01', name: '첫 쉼터', description: '여행 벤치를 마을에 놓기', condition: { kind: 'placed', value: 'bench' }, reward: { materials: { wood: 4, stone: 3, seed: 2 } } },
  { id: 'q02', name: '토담의 화단', description: '꽃 화단을 놓아 토담 초대하기', requires: 'q01', condition: { kind: 'placed', value: 'flowerbed' }, reward: { resident: 'todam', materials: { wood: 6, stone: 4, fabric: 2 } } },
  { id: 'q03', name: '밤길의 불빛', description: '종이 등불 놓기', requires: 'q02', condition: { kind: 'placed', value: 'lamp' }, reward: { materials: { wood: 6, stone: 5, fabric: 2 } } },
  { id: 'q04', name: '손으로 만든 집', description: '작업장 세우기', requires: 'q03', condition: { kind: 'placed', value: 'workshop' }, reward: { materials: { wood: 6, stone: 4, fabric: 3 } } },
  { id: 'q05', name: '함께 먹는 식사', description: '나무 탁자 놓기', requires: 'q04', condition: { kind: 'placed', value: 'table' }, reward: { materials: { wood: 5, stone: 3, seed: 3 } } },
  { id: 'q06', name: '새미의 작은 정원', description: '화분을 놓아 새미 초대하기', requires: 'q05', condition: { kind: 'placed', value: 'planter' }, reward: { resident: 'saemi', materials: { wood: 6, stone: 4, fabric: 4, seed: 2 } } },
  { id: 'q07', name: '이틀의 수확', description: '서로 다른 날 정원을 두 번 수확하기', requires: 'q06', condition: { kind: 'garden_days', value: 2 }, reward: { materials: { wood: 6, stone: 5, fabric: 3 } } },
  { id: 'q08', name: '우리들의 집', description: '주민 집 세우기', requires: 'q07', condition: { kind: 'placed', value: 'cottage' }, reward: { gridSize: 16, materials: { wood: 8, stone: 6, fabric: 4 } } },
  { id: 'q09', name: '여행 이야기', description: '여행 책장 놓기', requires: 'q08', condition: { kind: 'placed', value: 'bookshelf' }, reward: { materials: { wood: 6, stone: 5, fabric: 3 } } },
  { id: 'q10', name: '따뜻한 찻집', description: '찻집 세우기', requires: 'q09', condition: { kind: 'placed', value: 'tea_house' }, reward: { gridSize: 20, materials: { wood: 8, stone: 8, fabric: 4, seed: 3 } } },
  { id: 'q11', name: '물소리', description: '작은 분수 놓기', requires: 'q10', condition: { kind: 'placed', value: 'fountain' }, reward: { materials: { wood: 5, stone: 5, seed: 3 } } },
  { id: 'q12', name: '새로운 길', description: '나무 다리 놓기', requires: 'q11', condition: { kind: 'placed', value: 'bridge' }, reward: { materials: { wood: 6, stone: 4, fabric: 2 } } },
  { id: 'q13', name: '꽃길의 문', description: '꽃 아치 놓기', requires: 'q12', condition: { kind: 'placed', value: 'flower_arch' }, reward: { materials: { wood: 6, stone: 4, seed: 4 } } },
  { id: 'q14', name: '가득한 여행가방', description: '서로 다른 물건 10종을 마을에 놓기', requires: 'q13', condition: { kind: 'distinct_items', value: 10 }, reward: { materials: { wood: 10, stone: 8, fabric: 6, seed: 4 } } },
];

export const residents = [
  { id: 'botta', name: '보따', role: '여행 기록가' },
  { id: 'todam', name: '토담', role: '정원지기' },
  { id: 'saemi', name: '새미', role: '찻집 요리사' },
] as const;
