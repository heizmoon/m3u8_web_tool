let ffmpeg = null;

async function initCore() {
    const runBtn = document.getElementById('runBtn');
    try {
        const { FFmpeg } = window.FFmpegWASM || window.FFmpeg;
        ffmpeg = new FFmpeg();
        
        ffmpeg.on('log', ({ message }) => {
            UI.writeLog(`[内核] ${message}`);
            if (message.includes('frame=')) UI.updateStatsFromLog(message);
        });

        // 细化初始化进度
        const wasmURL = await fetchWithProgress('./ffmpeg-core.wasm', '引擎内核', 31000000);
        UI.updateProgress("正在启动本地解码环境 (1/2)...", 50);
        await ffmpeg.load({ coreURL: './ffmpeg-core.js', wasmURL, workerURL: './ffmpeg-core.worker.js' });
        UI.updateProgress("引擎就绪 (2/2)", 100);
        
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.innerText = "选择文件夹并开始";
        }
        UI.setStep(2);
    } catch (e) { UI.writeLog("初始化失败: " + e.message); }
}

async function fetchWithProgress(url, name, estSize) {
    const resp = await fetch(url);
    const reader = resp.body.getReader();
    const total = +resp.headers.get('Content-Length') || estSize;
    let loaded = 0; let chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        UI.updateProgress(`下载引擎: ${name}`, Math.min(Math.round((loaded/total)*100), 99));
    }
    return URL.createObjectURL(new Blob(chunks));
}

// 核心合并逻辑
document.addEventListener('DOMContentLoaded', () => {
    const runBtn = document.getElementById('runBtn');
    if (!runBtn) return;

    runBtn.onclick = async () => {
        try {
            const dir = await window.showDirectoryPicker();
            runBtn.disabled = true;
            runBtn.innerText = "合并中...";
            UI.setStep(3);

            let tsList = []; let totalSize = 0; let m3u8File = null; let keyFiles = [];
            async function scan(h) {
                for await (const e of h.values()) {
                    if (e.kind === 'file') {
                        const f = await e.getFile();
                        if (e.name.endsWith('.ts')) { tsList.push({handle: e, size: f.size}); totalSize += f.size; }
                        else if (e.name.endsWith('.key')) keyFiles.push(e);
                        else if (e.name.endsWith('.m3u8')) m3u8File = e;
                    } else await scan(e);
                }
            }
            await scan(dir);
            if (!m3u8File) throw new Error("未找到清单文件");
            tsList.sort((a, b) => a.handle.name.localeCompare(b.handle.name, undefined, {numeric: true}));

            // 智能容量分段
            const CHUNK_LIMIT = 1024 * 1024 * 1024; // 1GB
            let batches = totalSize < 1.5 * CHUNK_LIMIT ? [tsList] : splitBatches(tsList, CHUNK_LIMIT);

            const m3u8Raw = await (await m3u8File.getFile()).text();
            try { await ffmpeg.createDir('index'); } catch(e){}
            for(const k of keyFiles) await ffmpeg.writeFile(`index/${k.name}`, new Uint8Array(await (await k.getFile()).arrayBuffer()));

            let totalIdx = 0;
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const partName = `Part_${i + 1}.mp4`;
                for (const ts of batch) {
                    totalIdx++;
                    UI.updateProgress(`正在准备数据 (${totalIdx}/${tsList.length})`, Math.round((totalIdx/tsList.length)*100));
                    await ffmpeg.writeFile(`index/${ts.handle.name}`, new Uint8Array(await (await ts.handle.getFile()).arrayBuffer()));
                }

                // 局部清单构造
                const currentNames = new Set(batch.map(t => t.handle.name));
                const filtered = m3u8Raw.split('\n').filter(l => l.includes('.ts') ? currentNames.has(l.trim().split('/').pop()) : true).join('\n').replace(/URI="([^"]+)"/g, (m, p) => `URI="index/${p.split('/').pop()}"`);
                await ffmpeg.writeFile('temp.m3u8', new TextEncoder().encode(filtered));

                // 合并
                await ffmpeg.exec(['-allowed_extensions', 'ALL', '-i', 'temp.m3u8', '-c', 'copy', '-fflags', '+genpts+igndts', partName]);
                const data = await ffmpeg.readFile(partName);
                UI.downloadFile(data, `${dir.name}_${partName}`);
                
                await ffmpeg.deleteFile(partName);
                for(const ts of batch) await ffmpeg.deleteFile(`index/${ts.handle.name}`);
            }
            UI.writeLog("🎉 任务完成");
        } catch (e) { UI.writeLog("❌ 失败: " + e.message); }
        finally { runBtn.disabled = false; runBtn.innerText = "选择文件夹并开始"; UI.setStep(2); }
    };
});

function splitBatches(list, limit) {
    let res = []; let cur = []; let sum = 0;
    for(const t of list) {
        cur.push(t); sum += t.size;
        if(sum >= limit) { res.push(cur); cur = []; sum = 0; }
    }
    if(cur.length) res.push(cur);
    return res;
}

initCore();
/**
 * 核心逻辑补全：本地 MP4 无损拼合
 * 对应 index.html 中的 mergeMp4Btn 按钮
 */
document.addEventListener('DOMContentLoaded', () => {
    const mergeMp4Btn = document.getElementById('mergeMp4Btn');
    if (!mergeMp4Btn) return;

    mergeMp4Btn.onclick = async () => {
        const btn = mergeMp4Btn;
        try {
            // 1. 让用户选择多个导出的 Part 文件
            const fileHandles = await window.showOpenFilePicker({
                multiple: true,
                types: [{
                    description: '视频分段文件',
                    accept: { 'video/mp4': ['.mp4'] }
                }]
            });

            if (fileHandles.length < 2) {
                alert("请至少选择两个分段文件进行拼合");
                return;
            }

            // 锁定按钮，更新状态
            btn.disabled = true;
            btn.innerText = "拼合中...";
            UI.writeLog(`🔗 开始拼合 ${fileHandles.length} 个文件...`);
            UI.updateProgress("正在准备拼合数据...", 10);

            // 2. 将选中的文件写入 WASM 虚拟文件系统，并生成文件清单
            let concatList = "";
            for (let i = 0; i < fileHandles.length; i++) {
                const file = await fileHandles[i].getFile();
                const vfsName = `merge_input_${i}.mp4`;
                
                UI.updateProgress(`读取文件: ${file.name}`, Math.round((i / fileHandles.length) * 80));
                
                const arrayBuffer = await file.arrayBuffer();
                await ffmpeg.writeFile(vfsName, new Uint8Array(arrayBuffer));
                
                concatList += `file '${vfsName}'\n`;
            }

            // 3. 写入 FFmpeg 拼合清单文件
            await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(concatList));

            // 4. 执行无损拼合指令
            // -f concat: 使用合并协议
            // -c copy: 无损流拷贝（不重编码，保护画质且速度极快）
            UI.writeLog("🚀 正在执行无损串联，请稍候...");
            await ffmpeg.exec([
                '-f', 'concat', 
                '-safe', '0', 
                '-i', 'concat_list.txt', 
                '-c', 'copy', 
                'Final_Total_Video.mp4'
            ]);

            // 5. 读取合并后的结果并触发下载
            UI.updateProgress("拼合完成，准备导出", 100);
            const finalData = await ffmpeg.readFile('Final_Total_Video.mp4');
            UI.downloadFile(finalData, "合并完成_Total_Video.mp4");

            // 6. 清理内存，防止浏览器卡死
            UI.writeLog("🧹 正在清理缓存内存...");
            await ffmpeg.deleteFile('Final_Total_Video.mp4');
            await ffmpeg.deleteFile('concat_list.txt');
            for (let i = 0; i < fileHandles.length; i++) {
                await ffmpeg.deleteFile(`merge_input_${i}.mp4`);
            }

            UI.writeLog("✅ 全体拼合成功！");

        } catch (e) {
            UI.writeLog("❌ 拼合失败: " + e.message);
            console.error(e);
        } finally {
            btn.disabled = false;
            btn.innerText = "🧩 选中本地 MP4 文件并拼合";
            UI.updateProgress("等待下一次任务", 0);
        }
    };
});