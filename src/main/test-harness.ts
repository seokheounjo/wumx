/**
 * 자동화 테스트 하네스
 * Electron의 webContents.executeJavaScript()로 렌더러 상태를 검증하고,
 * PTY에 명령어를 보내서 터미널 동작을 확인합니다.
 */
import { BrowserWindow } from 'electron';

export class TestHarness {
  private win: BrowserWindow;
  private results: Array<{ name: string; pass: boolean; detail: string }> = [];

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  private async exec(js: string): Promise<any> {
    try {
      return await this.win.webContents.executeJavaScript(`(function(){ try { return (${js}); } catch(e) { return '__ERR__:' + e.message; } })()`);
    } catch (e: any) {
      return '__ERR__:' + e.message;
    }
  }

  private async execAsync(js: string): Promise<any> {
    try {
      return await this.win.webContents.executeJavaScript(`(async function(){ try { return await (${js}); } catch(e) { return '__ERR__:' + e.message; } })()`);
    } catch (e: any) {
      return '__ERR__:' + e.message;
    }
  }

  private log(name: string, pass: boolean, detail: string = '') {
    this.results.push({ name, pass, detail });
    const icon = pass ? 'PASS' : 'FAIL';
    console.log(`[TEST] ${icon} - ${name}${detail ? ': ' + detail : ''}`);
  }

  async runAll(): Promise<void> {
    this.results = [];
    console.log('\n========== wumx AUTO TEST START ==========\n');

    // + 버튼으로 워크스페이스 추가 (렌더러가 자동 갱신)
    await this.exec(`
      (function(){ var btn = document.querySelector('.sidebar-add-btn'); if(btn) btn.click(); return true; })()
    `);
    await new Promise(r => setTimeout(r, 2000));
    // 첫 번째 워크스페이스로 돌아가기 (터미널 렌더링 확인용)
    await this.exec(`
      (function(){ var tabs = document.querySelectorAll('.workspace-tab'); if(tabs[0]) tabs[0].click(); return true; })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    await this.testUI();
    await this.testTerminal();
    await this.testWorkspaceSwitching();
    await this.testPaneSplit();
    await this.testNotifications();
    await this.testPerformance();

    console.log('\n========== TEST RESULTS ==========');
    const passed = this.results.filter(r => r.pass).length;
    const failed = this.results.filter(r => !r.pass).length;
    console.log(`PASSED: ${passed} / FAILED: ${failed} / TOTAL: ${this.results.length}`);
    if (failed > 0) {
      console.log('\nFAILED ITEMS:');
      this.results.filter(r => !r.pass).forEach(r => console.log(`  - ${r.name}: ${r.detail}`));
    }
    console.log('========== AUTO TEST END ==========\n');
  }

  // ===== B. UI 검증 =====
  private async testUI() {
    // B1. 앱 창 표시
    const bounds = this.win.getBounds();
    this.log('B1. 앱 창 표시', bounds.width > 100 && bounds.height > 100, `${bounds.width}x${bounds.height}`);

    // B2. 타이틀바
    const hasTitle = await this.exec(`!!document.querySelector('.titlebar')`);
    this.log('B2. 타이틀바', hasTitle);

    // B3. 사이드바 (테스트 시작 시 2개 이상)
    const wsCount = await this.exec(`document.querySelectorAll('.workspace-tab').length`);
    this.log('B3. 사이드바 워크스페이스', wsCount >= 2, `${wsCount}개`);

    // B4. 상태바
    const hasStatusbar = await this.exec(`!!document.querySelector('.statusbar')`);
    this.log('B4. 상태바', hasStatusbar);

    // B5. DevTools
    const devToolsOpen = this.win.webContents.isDevToolsOpened();
    this.log('B5. DevTools 닫힘', !devToolsOpen);
  }

  // ===== C. 터미널 검증 =====
  private async testTerminal() {
    // C1. 터미널 너비
    const termWidth = await this.exec(`
      (function(){ var el = document.querySelector('.terminal-wrapper'); return el ? el.clientWidth : 0; })()
    `);
    const parentWidth = await this.exec(`
      (function(){ var el = document.querySelector('.workspace-content'); return el ? el.clientWidth : 0; })()
    `);
    const tw = typeof termWidth === 'number' ? termWidth : 0;
    const pw = typeof parentWidth === 'number' ? parentWidth : 1;
    const ratio = pw > 0 ? tw / pw : 0;
    this.log('C1. 터미널 전체 너비', ratio > 0.5, `termWidth=${tw} parentWidth=${pw} ratio=${ratio.toFixed(2)}`);

    // C1b. 터미널 높이
    const termHeight = await this.exec(`
      (function(){ var el = document.querySelector('.terminal-wrapper'); return el ? el.clientHeight : 0; })()
    `);
    this.log('C1b. 터미널 높이', termHeight > 100, `height=${termHeight}`);

    // C2. xterm 렌더링 확인
    const hasXterm = await this.exec(`!!document.querySelector('.xterm-screen')`);
    this.log('C2. xterm 렌더링', hasXterm);

    // C3. 명령어 실행 테스트 - PTY에 echo 보내고 결과 확인
    // PTY에 테스트 명령어 전송
    await this.exec(`
      window.wumx.send('pty:data', {
        paneId: document.querySelector('.terminal-pane')?.getAttribute('data-pane-id') || '',
        data: ''
      });
    `);
    // xterm cols 확인 (너비 문제 검증)
    const cols = await this.exec(`
      const cache = window.__terminalTestCols;
      cache || 0;
    `);

    // C6. 스크롤 - xterm-viewport 존재 확인
    const hasViewport = await this.exec(`!!document.querySelector('.xterm-viewport')`);
    this.log('C6. 스크롤 영역', hasViewport);
  }

  // ===== D. 워크스페이스 전환 =====
  private async testWorkspaceSwitching() {
    // 현재 워크스페이스 수
    const count = await this.exec(`document.querySelectorAll('.workspace-tab').length`);
    if (count < 2) {
      this.log('D1-D3. 워크스페이스 전환', false, '워크스페이스 2개 이상 필요');
      return;
    }

    // 워크스페이스 인덱스로 구분
    const firstIdx = await this.exec(`
      Array.from(document.querySelectorAll('.workspace-tab')).findIndex(el => el.classList.contains('active'))
    `);

    // 두 번째 워크스페이스 클릭
    await this.exec(`
      (function(){ var tabs = document.querySelectorAll('.workspace-tab'); if(tabs[1]) tabs[1].click(); return true; })()
    `);
    await new Promise(r => setTimeout(r, 500));

    const secondIdx = await this.exec(`
      Array.from(document.querySelectorAll('.workspace-tab')).findIndex(el => el.classList.contains('active'))
    `);
    this.log('D1. 워크스페이스 전환', secondIdx !== firstIdx, `active: ${firstIdx} -> ${secondIdx}`);

    // 첫 번째로 돌아가기
    await this.exec(`
      (function(){ var tabs = document.querySelectorAll('.workspace-tab'); if(tabs[0]) tabs[0].click(); return true; })()
    `);
    await new Promise(r => setTimeout(r, 500));

    const backIdx = await this.exec(`
      Array.from(document.querySelectorAll('.workspace-tab')).findIndex(el => el.classList.contains('active'))
    `);
    this.log('D2. 복귀 후 상태', backIdx === firstIdx, `active: ${backIdx}`);

    // D3. 2초 대기 후 튕김 없음
    await new Promise(r => setTimeout(r, 2500));
    const stillIdx = await this.exec(`
      Array.from(document.querySelectorAll('.workspace-tab')).findIndex(el => el.classList.contains('active'))
    `);
    this.log('D3. 2초 후 튕김 없음', stillIdx === firstIdx, `active: ${stillIdx}`);
  }

  // ===== E. 패널 분할 =====
  private async testPaneSplit() {
    const beforeCount = await this.exec(`document.querySelectorAll('.terminal-pane').length`);

    // 분할 버튼 클릭
    await this.exec(`
      (function(){ var btns = document.querySelectorAll('.terminal-pane-actions button'); if(btns.length >= 2){ btns[1].click(); return true; } return false; })()
    `);

    await new Promise(r => setTimeout(r, 2000));

    const afterCount = await this.exec(`document.querySelectorAll('.terminal-pane').length`);
    this.log('E2. 세로 분할', afterCount > beforeCount, `패널: ${beforeCount} -> ${afterCount}`);

    // E6. 패널 이름
    const paneName = await this.exec(`
      (function(){ var h = document.querySelector('.terminal-pane-header strong'); return h ? h.textContent : ''; })()
    `);
    this.log('E6. 패널 이름 표시', typeof paneName === 'string' && paneName.length > 0, `이름: ${paneName}`);

    // E8. 사이드바 패널 정보 (10초 갱신 대기)
    await new Promise(r => setTimeout(r, 11000));
    const sidebarPanes = await this.exec(`
      (function(){ var items = document.querySelectorAll('.workspace-tab-meta-item'); var found = false; items.forEach(function(el){ if(el.textContent.indexOf('Terminal') >= 0) found = true; }); return found; })()
    `);
    this.log('E8. 사이드바 패널 정보', sidebarPanes === true, `found: ${sidebarPanes}`);

    // E4. 디바이더
    const hasDivider = await this.exec(`!!document.querySelector('.split-divider')`);
    this.log('E4. 분할 디바이더', hasDivider === true);
  }

  // ===== F. 알림 =====
  private async testNotifications() {
    const unreadBefore = await this.exec(`
      (function(){ var el = document.querySelector('.notification-badge'); return el ? parseInt(el.textContent) : 0; })()
    `);
    this.log('F5. 거짓 알림 없음', unreadBefore === 0, `unread: ${unreadBefore}`);
  }

  // ===== I. 성능 =====
  private async testPerformance() {
    const fps = await this.execAsync(`
      new Promise(function(resolve) {
        var count = 0;
        var start = performance.now();
        function frame() {
          count++;
          if (performance.now() - start < 1000) requestAnimationFrame(frame);
          else resolve(count);
        }
        requestAnimationFrame(frame);
      })
    `);
    this.log('I1. FPS', typeof fps === 'number' && fps > 30, `${fps} fps`);
  }
}
