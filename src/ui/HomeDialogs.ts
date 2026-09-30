import Phaser from 'phaser';
import type { PlayerProgress } from '../progression/PlayerProgress';
import { avatars } from '../progression/profile';
import { label } from './text';
import { audioForScene } from '../audio/AudioManager';

export interface NicknameInput { value(): string; destroy(): void }
export type NicknameInputFactory = (scene: Phaser.Scene, value: string) => NicknameInput;
// 单个原生输入框覆盖到逻辑画布位置；不引入DOM Scene或账号系统。
export const nicknameInput: NicknameInputFactory = (scene, value) => {
  const input = document.createElement('input');
  input.value = value; input.type = 'text'; input.maxLength = 40; input.setAttribute('aria-label', '昵称');
  Object.assign(input.style, { position: 'fixed', zIndex: '10', boxSizing: 'border-box', background: '#fffaf0', border: '2px solid #c2bcae', textAlign: 'center' });
  const position = (): void => {
    const rect = scene.game.canvas.getBoundingClientRect();
    Object.assign(input.style, { left: `${rect.left + rect.width * 150 / 750}px`, top: `${rect.top + rect.height * 450 / 1334}px`,
      width: `${rect.width * 450 / 750}px`, height: `${rect.height * 60 / 1334}px`, fontSize: `${rect.width * 28 / 750}px` });
  };
  document.body.append(input); position(); input.focus();
  window.addEventListener('resize', position); scene.scale.on('resize', position);
  return { value: () => input.value, destroy: () => { input.remove(); window.removeEventListener('resize', position); scene.scale.off('resize', position); } };
};
function shell(scene: Phaser.Scene, onClose: () => void) {
  let closed = false;
  const objects: Phaser.GameObjects.GameObject[] = [];
  const shade = scene.add.rectangle(375, 667, 750, 1334, 0x353d36, 0.65).setDepth(20).setInteractive();
  const panel = scene.add.rectangle(375, 667, 610, 780, 0xfffcf4).setDepth(21).setInteractive();
  panel.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
  const cleanups: (() => void)[] = [];
  const close = (): void => {
    if (closed) return; closed = true;
    cleanups.forEach(cleanup => cleanup()); objects.forEach(object => object.destroy()); shade.destroy(); panel.destroy();
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, close); onClose();
  };
  shade.on('pointerdown', () => { audioForScene(scene).uiClick(); close(); }); scene.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
  const text = (x: number, y: number, value: string, size = 26, color = '#514c40') => {
    const object = label(scene, x, y, value, size, color).setDepth(23); objects.push(object); return object;
  };
  const button = (x: number, y: number, value: string, run: () => void, color = 0x697e67, width = 250) => {
    const object = scene.add.rectangle(x, y, width, 72, color).setDepth(22).setInteractive({ useHandCursor: true }); objects.push(object);
    object.on('pointerdown', () => { if (!closed) { audioForScene(scene).uiClick(); run(); } }); return { control: object, text: text(x, y, value, 26, '#fffaf0') };
  };
  button(635, 320, '×', close, 0x8b8272, 50);
  return { close, text, button, cleanups, closed: () => closed };
}
export function showProfile(scene: Phaser.Scene, progress: PlayerProgress, onClose: () => void, inputFactory = nicknameInput): void {
  const dialog = shell(scene, onClose), profile = progress.save.profile;
  dialog.text(375, 360, '玩家资料', 34); dialog.text(375, 420, '昵称（2～10个可见字符）', 24);
  const input = inputFactory(scene, profile.nickname); dialog.cleanups.push(() => input.destroy());
  let avatarId = profile.avatarId;
  const selected = dialog.text(375, 550, `当前头像：${avatars.find(avatar => avatar.id === avatarId)!.symbol}`, 24);
  avatars.forEach((avatar, index) => {
    dialog.button(150 + index % 6 * 90, 640 + Math.floor(index / 6) * 100, avatar.symbol, () => {
      avatarId = avatar.id; selected.setText(`当前头像：${avatar.symbol}`);
    }, 0xe1ddcf, 76);
  });
  const error = dialog.text(375, 950, '', 22, '#a65040');
  dialog.button(375, 870, '保存', () => {
    if (progress.updateProfile({ nickname: input.value(), avatarId })) dialog.close();
    else error.setText('请填写2～10个可见字符的昵称。');
  });
}
export function showSettings(scene: Phaser.Scene, progress: PlayerProgress, onClose: () => void): void {
  const dialog = shell(scene, onClose);
  const audio = audioForScene(scene);
  const title = dialog.text(375, 440, '游戏设置', 34);
  const description = dialog.text(375, 680, '进度仅保存在当前浏览器/设备。', 24);
  const music = dialog.button(375, 525, '', () => {
    progress.setAudioPreference('musicEnabled', !progress.save.audio.musicEnabled);
    audio.setOptions(progress.save.audio); refresh();
  }, 0x697e67, 320);
  const sfx = dialog.button(375, 605, '', () => {
    progress.setAudioPreference('sfxEnabled', !progress.save.audio.sfxEnabled);
    audio.setOptions(progress.save.audio); refresh();
  }, 0x697e67, 320);
  const refresh = (): void => {
    music.text.setText(`音乐：${progress.save.audio.musicEnabled ? '开' : '关'}`);
    sfx.text.setText(`音效：${progress.save.audio.sfxEnabled ? '开' : '关'}`);
  };
  refresh();
  const reset = dialog.button(375, 760, '重置游戏进度', () => {
    reset.control.disableInteractive().setVisible(false); reset.text.setVisible(false);
    for (const toggle of [music, sfx]) { toggle.control.disableInteractive().setVisible(false); toggle.text.setVisible(false); }
    title.setText('确定重新开始吗？');
    description.setText('将清除当前浏览器/设备的金币、战绩、段位、已获得道具、装备、商店进度、昵称/头像及一次性欢迎事件。\n此操作无法恢复。')
      .setWordWrapWidth(490, true).setFixedSize(500, 260).setPosition(375, 680);
    const cancel = dialog.button(220, 930, '取消', () => {
      title.setText('游戏设置'); description.setText('进度仅保存在当前浏览器/设备。').setFixedSize(0, 0).setPosition(375, 680);
      [cancel.control, cancel.text, confirm.control, confirm.text].forEach(object => object.destroy());
      reset.control.setVisible(true).setInteractive({ useHandCursor: true }); reset.text.setVisible(true);
      for (const toggle of [music, sfx]) { toggle.control.setVisible(true).setInteractive({ useHandCursor: true }); toggle.text.setVisible(true); }
    });
    const confirm = dialog.button(530, 930, '确定重置', () => { confirm.control.disableInteractive(); cancel.control.disableInteractive(); progress.reset(); audio.setOptions(progress.save.audio); dialog.close(); }, 0xa65040);
  }, 0xa65040, 320);
}
