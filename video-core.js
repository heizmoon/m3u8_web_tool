// 1. 首先删除文件开头重复的 let ffmpeg = null;
let ffmpeg = null; 
const RUN_BTN = document.getElementById('runBtn');
const FIXED_ENGINE_SIZE = 31.2 * 1024 * 1024;
let taskDuration = 0; // 任务总时长 (秒)

// 新增解耦辅助函数：无论路径是什么，自动创建目录防止卡死
async function safeWriteFile(path, data) {
    const parts = path.split('/');
    if (parts.length > 1) {
        let currentPath = "";
        for (let i = 0; i < parts.length - 1; i++) {
            currentPath += (currentPath ? "/" : "") + parts[i];
            try { await ffmpeg.createDir(currentPath); } catch (e) {}
        }
    }
    return await ffmpeg.writeFile(path, data);
}

// 解析 M3U8 总时长
function parseTotalDuration(m3u8Content) {
    let total = 0;
    const lines = m3u8Content.split('\n');
    for (const line of lines) {
        if (line.startsWith('#EXTINF:')) {
            const duration = parseFloat(line.split(':')[1]);
            if (!isNaN(duration)) total += duration;
        }
    }
    return total;
}

// 解析时间字符串为秒 (00:01:23.45 -> 83.45)
function parseTimeStr(timeStr) {
    const parts = timeStr.split(':');
    if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return 0;
}

async function initCore() {
    try {
        const { FFmpeg } = window.FFmpegWASM || window.FFmpeg;
        ffmpeg = new FFmpeg();
        
        ffmpeg.on('log', ({ message }) => {
            UI.writeLog(`[内核] ${message}`);
            
            // 实时分析日志，驱动主进度条
            if (message.includes('time=')) {
                UI.updateStatsFromLog(message);
                if (taskDuration > 0) {
                    const timeMatch = message.match(/time=\s*([\d:.]+)/);
                    if (timeMatch) {
                        const currentSec = parseTimeStr(timeMatch[1]);
                        // VFS写入占5%，合并占95%。所以合并进度 = 5 + (当前/总 * 95)
                        const pct = Math.min(5 + Math.round((currentSec / taskDuration) * 95), 100);
                        UI.updateProgress(`正在合并视频: ${timeMatch[1]} / 预计总长`, pct);
                    }
                }
            }
        });

        // 下载阶段：独立跑满 0-100%
        const wasmURL = await fetchWithProgress('./ffmpeg-core.wasm', '引擎内核', FIXED_ENGINE_SIZE);
        
        // 重置进度条，进入第二阶段
        UI.updateProgress("正在加载脚本组件...", 0);
        
        // 模拟加载核心 JS 的进度 (占前 20%)
        UI.updateProgress("正在解析核心组件: ffmpeg-core.js", 10);
        await new Promise(r => setTimeout(r, 100)); // 视觉缓冲
        UI.updateProgress("正在解析核心组件: ffmpeg-worker.js", 20);

        // 优化 3/3 阶段：捕获 Worker 启动计数
        let workerCount = 0;
        const totalWorkers = navigator.hardwareConcurrency || 4; // 通常取决于 CPU 核心数
        
        // 初始状态 (20%)
        UI.updateProgress(`正在启动多线程引擎: 0/${totalWorkers} 线程就绪`, 20);

        // 监听 Worker 启动（解耦式监听）
        const originalWorker = window.Worker;
        window.Worker = function(scriptURL, options) {
            if (scriptURL.toString().includes('ffmpeg')) {
                workerCount++;
                // 剩余 80% 的进度由线程启动均分
                const initPct = 20 + Math.round((workerCount / totalWorkers) * 80);
                UI.updateProgress(`正在启动多线程引擎: ${workerCount}/${totalWorkers} 线程就绪`, initPct);
            }
            return new originalWorker(scriptURL, options);
        };

        await ffmpeg.load({ coreURL: './ffmpeg-core.js', wasmURL, workerURL: './ffmpeg-core.worker.js' });
        
        // 恢复原始 Worker
        window.Worker = originalWorker;

        UI.updateProgress("引擎准备就绪", 100);
        if (RUN_BTN) { RUN_BTN.disabled = false; RUN_BTN.innerText = "选择文件夹并开始"; }
        UI.setStep(2); // 进度条下方步骤切换
    } catch (e) { UI.writeLog("初始化失败: " + e.message); }
}
/**
 * 引擎下载逻辑：修复数值错误
 */
async function fetchWithProgress(url, name, fixedSize) {
    const resp = await fetch(url);
    const reader = resp.body.getReader();
    let loaded = 0;
    let chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;

        const loadedMB = (loaded / 1024 / 1024).toFixed(1);
        const totalMB = (fixedSize / 1024 / 1024).toFixed(1); // 强制使用 31.2
        
        // 下载阶段直接映射 0-100%
        let pct = Math.round((loaded / fixedSize) * 100);
        if (pct > 100) pct = 100; // 防止溢出

        UI.updateProgress(
            `下载引擎: ${name} (${loadedMB}MB / ${totalMB}MB)`, 
            pct
        );
    }
    return URL.createObjectURL(new Blob(chunks));
}

/**
 * M3U8 自动化合并逻辑
 */
document.addEventListener('DOMContentLoaded', () => {
    const runBtn = document.getElementById('runBtn');
    if (!runBtn) return;

    runBtn.onclick = async () => {
        try {
            const dir = await window.showDirectoryPicker();
            runBtn.disabled = true;
            runBtn.innerText = "处理中...";
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

            // 解析 M3U8 并计算总时长
            const m3u8Raw = await (await m3u8File.getFile()).text();
            taskDuration = parseTotalDuration(m3u8Raw);
            UI.writeLog(`[分析] 视频总时长: ${taskDuration.toFixed(1)} 秒，切片数量: ${tsList.length}`);

            const CHUNK_LIMIT = 1024 * 1024 * 1024; // 1GB
            let batches = totalSize < 1.5 * CHUNK_LIMIT ? [tsList] : splitBatches(tsList, CHUNK_LIMIT);

            try { await ffmpeg.createDir('index'); } catch(e){}
            for(const k of keyFiles) await safeWriteFile(`index/${k.name}`, new Uint8Array(await (await k.getFile()).arrayBuffer()));

            let totalIdx = 0;
            // let lastPct = -1; // 不再由写入阶段主导 UI

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const partName = `Part_${i + 1}.mp4`;
                
                // 如果分段了，我们需要重新估算当前 Batch 的时长，这里简化处理，假设只有一个 Batch 或均匀分布
                // 如果是多段，taskDuration 应该动态调整，但为保持简单，这里暂用总时长（影响不大，因为日志会自动修正）

                for (const ts of batch) {
                    totalIdx++;
                    
                    // 写入阶段只占前 5% 的进度
                    const writePct = Math.round((totalIdx / tsList.length) * 5);
                    UI.updateProgress(`准备数据: ${totalIdx} / ${tsList.length}`, writePct);

                    // 降低 UI 刷新频率，防止卡顿
                    if (totalIdx % 50 === 0) await new Promise(r => setTimeout(r, 0));

                    await safeWriteFile(`index/${ts.handle.name}`, new Uint8Array(await (await ts.handle.getFile()).arrayBuffer()));
                }

                // 阶段切换提示
                UI.updateProgress(`开始合并 (Part ${i+1})...`, 5);
                UI.writeLog(`[状态] 数据准备完毕，启动内核合并 (Part ${i+1})...`);

                const currentNames = new Set(batch.map(t => t.handle.name));
                const filtered = m3u8Raw.split('\n').filter(l => l.includes('.ts') ? currentNames.has(l.trim().split('/').pop()) : true).join('\n').replace(/URI="([^"]+)"/g, (m, p) => `URI="index/${p.split('/').pop()}"`);
                await safeWriteFile('temp.m3u8', new TextEncoder().encode(filtered));

                await ffmpeg.exec(['-allowed_extensions', 'ALL', '-i', 'temp.m3u8', '-c', 'copy', '-fflags', '+genpts+igndts', partName]);
                const data = await ffmpeg.readFile(partName);
                UI.downloadFile(data, `${dir.name}_${partName}`);
                
                await ffmpeg.deleteFile(partName);
                for(const ts of batch) await ffmpeg.deleteFile(`index/${ts.handle.name}`);
            }
            UI.writeLog("🎉 任务完成");
            UI.updateProgress("任务完成", 100);
        } catch (e) { UI.writeLog("❌ 失败: " + e.message); }
        finally { runBtn.disabled = false; runBtn.innerText = "选择文件夹并开始"; UI.setStep(2); taskDuration = 0; }
    };

    // 本地 MP4 拼合逻辑
    const mergeBtn = document.getElementById('mergeMp4Btn');
    if (mergeBtn) {
        mergeBtn.onclick = async () => {
            try {
                const files = await window.showOpenFilePicker({ multiple: true });
                mergeBtn.disabled = true;
                UI.writeLog("🔗 开始无损拼合本地文件...");
                
                let listTxt = "";
                for (let i = 0; i < files.length; i++) {
                    const f = await files[i].getFile();
                    const vfsName = `m${i}.mp4`;
                    UI.updateProgress(`读取分段: ${i+1} / ${files.length}`, Math.round(((i+1)/files.length)*100));
                    await safeWriteFile(vfsName, new Uint8Array(await f.arrayBuffer()));
                    listTxt += `file '${vfsName}'\n`;
                }
                await safeWriteFile('list.txt', new TextEncoder().encode(listTxt));
                await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'Total_Merged.mp4']);
                const data = await ffmpeg.readFile('Total_Merged.mp4');
                UI.downloadFile(data, "合并结果_Full.mp4");
                UI.writeLog("✅ 拼合任务已完成！");
            } catch (e) { UI.writeLog("❌ 拼合失败: " + e.message); }
            finally { mergeBtn.disabled = false; UI.updateProgress("就绪", 0); }
        };
    }
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