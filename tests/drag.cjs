// Run with Playwright available via NODE_PATH. Uses an isolated browser and mock responses.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1000,height:700}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let requests = 0;
    await page.route('**/*', async route => {
      if (route.request().url() === 'http://127.0.0.1:8765/proofread') {
        requests++;
        return route.fulfill({json:{corrected:'修正済みテスト😊・・・',issues:[]}});
      }
      return route.abort();
    });
    await page.setContent('<style>body{margin:0;height:2400px}main{margin:180px 100px}textarea{display:block;width:360px;height:120px}button{margin-top:0}</style><main><textarea id="one">テスト😊・・・</textarea><button id="under" onclick="this.textContent=\'クリックできました\'">下のボタン</button><textarea id="two">別の入力欄</textarea><div contenteditable="true" style="margin-top:40px">リッチエディタ</div></main>');
    await page.addStyleTag({path:path.join(__dirname,'../extension/content.css')});
    await page.addScriptTag({path:path.join(__dirname,'../extension/content.js')});
    const button = page.locator('.proof-button');
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const dragTo = async (x,y) => {
      const b = await button.boundingBox();
      await page.mouse.move(b.x+10,b.y+10);
      await page.mouse.down();
      await page.mouse.move(x+10,y+10,{steps:8});
      await page.mouse.up();
      await settle();
    };
    await page.locator('#one').click();
    await settle();
    assert(await button.isVisible());
    await dragTo(650,80);
    let b = await button.boundingBox();
    assert(Math.abs(b.x-650)<1 && Math.abs(b.y-80)<1);
    assert.equal(requests,0,'Drag must not proofread');
    assert.equal(await page.locator('#one').inputValue(),'テスト😊・・・');
    console.log('PASS drag, no request, original text preserved');
    await page.locator('#under').click();
    assert.equal(await page.locator('#under').textContent(),'クリックできました');
    await page.locator('#two').click();
    await settle();
    b = await button.boundingBox();
    assert.equal(b.x,650);
    await page.evaluate(() => scrollTo(0,500));
    await settle();
    b = await button.boundingBox();
    assert.equal(b.y,80);
    console.log('PASS underlying button, focus switch, scroll');
    await page.setViewportSize({width:500,height:400});
    await page.waitForFunction(() => {
      const b = document.querySelector('.proof-button').getBoundingClientRect();
      return b.x >= 8 && b.right <= innerWidth - 8 && b.bottom <= innerHeight - 8;
    });
    await settle();
    b = await button.boundingBox();
    assert(b.x>=8 && b.x+b.width<=492 && b.y+b.height<=392);
    await dragTo(-100,-100);
    b = await button.boundingBox();
    assert.equal(b.x,8); assert.equal(b.y,8);
    console.log('PASS resize and edge clamp');
    await page.setViewportSize({width:1000,height:700});
    await page.evaluate(() => scrollTo(0,0));
    await page.locator('#one').click();
    await button.focus();
    await page.keyboard.press('Escape');
    await settle();
    b = await button.boundingBox();
    assert.equal(b.x,100);
    assert(b.y>100 && b.y<180);
    await button.click();
    await page.locator('.proof-panel').waitFor();
    assert.equal(requests,1);
    await page.locator('#apply').click();
    assert.equal(await page.locator('#one').inputValue(),'修正済みテスト😊・・・');
    console.log('PASS reset, normal click, full replacement with mock');
    await page.locator('[contenteditable]').click();
    await dragTo(720,110);
    assert.equal(requests,1);
    await button.focus();
    await page.keyboard.press('Enter');
    await page.locator('.proof-panel').waitFor();
    assert.equal(requests,2);
    assert.equal(await page.locator('#apply').textContent(),'修正版をコピー');
    await page.locator('.proof-close').click();
    await page.locator('#one').click();
    await settle();
    if (process.env.SCREENSHOT_PATH) await page.screenshot({path:process.env.SCREENSHOT_PATH});
    assert.deepEqual(errors,[]);
    console.log('PASS rich editor drag, keyboard activation, no browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
