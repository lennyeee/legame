export const avatars = [
  { id: 'mouse', symbol: '🐭' }, { id: 'cat', symbol: '🐱' }, { id: 'dog', symbol: '🐶' },
  { id: 'frog', symbol: '🐸' }, { id: 'panda', symbol: '🐼' }, { id: 'pig', symbol: '🐷' },
  { id: 'duck', symbol: '🦆' }, { id: 'monkey', symbol: '🐵' }, { id: 'tiger', symbol: '🐯' },
  { id: 'rabbit', symbol: '🐰' }, { id: 'bear', symbol: '🐻' }, { id: 'fox', symbol: '🦊' },
] as const;
export interface PlayerProfile { readonly nickname: string; readonly avatarId: string }
export const defaultProfile = (): PlayerProfile => ({ nickname: '乐玩家', avatarId: 'mouse' });
export const avatarSymbol = (id: string): string => avatars.find(avatar => avatar.id === id)?.symbol ?? avatars[0].symbol;
export function validNickname(value: unknown): value is string {
  if (typeof value !== 'string' || /[\p{C}]/u.test(value)) return false;
  const length = [...value.trim().replace(/\s/gu, '')].length;
  return length >= 2 && length <= 10;
}
export function sanitizeProfile(value: unknown): PlayerProfile {
  const input = value as Partial<PlayerProfile> | null;
  return { nickname: validNickname(input?.nickname) ? input.nickname.trim() : defaultProfile().nickname,
    avatarId: avatars.some(avatar => avatar.id === input?.avatarId) ? input!.avatarId! : defaultProfile().avatarId };
}
export const opponentNames = ['不想上班','再输就睡','今天吃啥','别来财了','阿斗本人','这把有铲','钱呢','小美别睡','六级大狂风','刃哥不解释','农民企业家','铁饭碗真香','我真没急','先赢一把','随便玩玩','五个全是小','怎么又是刃','求你出个铲','阿饼睡醒没','乐在看着你','马上就翻盘','这把包赢的','我网卡了','刚洗完澡','女朋友在旁边','老板来了','最后一把真的','明天开始早睡','再来一次财','没钱了兄弟','别打我的乐','对面像人机','我不是人机','你先别急','手滑了','运气也是实力','让我合一下','这局有说法','下把一定','先叠个甲','不会真输了吧','我在等CD','满级刃法','铲子去哪了','发牌员针对我','这不是最后一把','今天不宜排位','先让我合成','来个武将谢谢','别出小了','马上有钱','这一把稳了','最后五分钟','我真的会玩','不许偷看','随缘上分'] as const;
const prefixes = ['沉默的','暴躁的','摸鱼的','迷路的','满级的','野生的','认真的','困困的','倔强的','路过的'];
const suffixes = ['刃哥','阿斗','农民','铲子','小美','阿饼','爆兵','狙手','打工人','路人'];
export function opponentNickname(random: () => number): string {
  return random() < 0.7 ? opponentNames[Math.min(opponentNames.length - 1, Math.floor(random() * opponentNames.length))]!
    : prefixes[Math.min(9, Math.floor(random() * prefixes.length))]! + suffixes[Math.min(9, Math.floor(random() * suffixes.length))]!;
}
