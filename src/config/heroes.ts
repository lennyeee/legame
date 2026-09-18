export const heroRecipes = [
  { name: '赵云', letters: ['赵', '云'] },
  { name: '关羽', letters: ['关', '羽'] },
  { name: '张飞', letters: ['张', '飞'] },
] as const;

export type HeroName = (typeof heroRecipes)[number]['name'];
export type HeroLetterType = (typeof heroRecipes)[number]['letters'][number];
