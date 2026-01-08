// 1. 首先删除文件开头重复的 let ffmpeg = null;
let ffmpeg = null; 
const RUN_BTN = document.getElementById('runBtn');
const FIXED_ENGINE_SIZE = 31.2 * 1024 * 1024;
let taskDuration = 0; // 任务总时长 (秒)
let previousBatchesDuration = 0; // 之前所有分段已完成的时长 (秒)

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

// 提取文件名
function getFileName(path) {
    return path.split('/').pop().split('?')[0];
}

// 解析 M3U8 总时长，并建立 文件名->时长 的映射
function parseM3u8Info(m3u8Content) {
    let total = 0;
    const durationMap = new Map();
    const lines = m3u8Content.split('\n');
    
    let currentDuration = 0;
    for (const line of lines) {
        const l = line.trim();
        if (l.startsWith('#EXTINF:')) {
            currentDuration = parseFloat(l.split(':')[1]);
        } else if (!l.startsWith('#') && l !== '') {
            // 这是一个文件行
            if (currentDuration > 0) {
                total += currentDuration;
                const fname = getFileName(l);
                durationMap.set(fname, currentDuration);
                currentDuration = 0; // 重置
            }
        }
    }
    return { total, durationMap };
}

// 解析时间字符串为秒 (00:01:23.45 -> 83.45)
function parseTimeStr(timeStr) {
    const parts = timeStr.split(':');
    if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return 0;
}

// 秒数格式化为 HH:MM:SS
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
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
                        const currentSegmentTime = parseTimeStr(timeMatch[1]);
                        // 全局时间 = 之前分段的总长 + 当前分段正在处理的时间
                        const globalTime = previousBatchesDuration + currentSegmentTime;
                        
                        // VFS写入占5%，合并占95%
                        const pct = Math.min(5 + Math.round((globalTime / taskDuration) * 95), 100);
                        const currentStr = formatTime(globalTime);
                        const totalStr = formatTime(taskDuration);
                        
                        UI.updateProgress(`正在合并视频: ${currentStr} / ${totalStr}`, pct);
                    }
                }
            }
        });

        // 下载阶段：独立跑满 0-100%
        const wasmURL = await fetchWithProgress('./ffmpeg-core.wasm', '引擎内核', FIXED_ENGINE_SIZE);
        
        // ==========================================
        // 阶段一：视觉安慰剂 (Simulated Progress)
        // 目的：在 WASM 编译卡顿前，先让用户看到密集的进度变化，消除焦虑
        // ==========================================
        const fakeSteps = [
            { txt: "正在进行环境自检...", pct: 5 },
            { txt: "校验核心文件完整性...", pct: 15 },
            { txt: "分配虚拟内存空间...", pct: 25 },
            { txt: "预热 WebAssembly 编译器...", pct: 35 },
            { txt: "正在编译核心组件 (CPU密集)...", pct: 50 },
            { txt: "准备启动多线程引擎...", pct: 60 }
        ];

        for (const step of fakeSteps) {
            UI.updateProgress(step.txt, step.pct);
            // 人为制造“快速处理”的视觉感，每步停留 100-200ms
            await new Promise(r => setTimeout(r, 150)); 
        }

        // ==========================================
        // 阶段二：真实加载 (Real Progress)
        // ==========================================
        
        // 优化 3/3 阶段：捕获 Worker 启动计数
        let activeWorkerCount = 0; // 真正活跃（已发送消息）的线程数
        const totalWorkers = navigator.hardwareConcurrency || 4; 
        
        // 监听 Worker 启动（解耦式监听）
        const originalWorker = window.Worker;
        window.Worker = function(scriptURL, options) {
            const w = new originalWorker(scriptURL, options);
            
            // 只有 FFmpeg 的 Worker 才需要监控
            if (scriptURL.toString().includes('ffmpeg')) {
                // 监听 Worker 的首条消息，代表它真正活了
                w.addEventListener('message', () => {
                    activeWorkerCount++;
                    
                    // 真实进度映射到 60% - 100% 的区间
                    // 这样即使编译卡住了，前面的 60% 已经给足了用户信心
                    const base = 60;
                    const range = 40;
                    const safeCount = Math.min(activeWorkerCount, totalWorkers);
                    const realPct = base + Math.round((safeCount / totalWorkers) * range);
                    
                    UI.updateProgress(
                        `正在启动计算单元: ${safeCount}/${totalWorkers} 线程就绪`,
                        realPct
                    );
                }, { once: true });
            }
            return w;
        };

        await ffmpeg.load({ coreURL: './ffmpeg-core.js', wasmURL, workerURL: './ffmpeg-core.worker.js' });
        
        // 恢复原始 Worker
        window.Worker = originalWorker;

        // 关键修复：ffmpeg.load() 可能在所有 Worker 发送消息前就 resolve 了
        // 或者主线程阻塞导致 UI 没来得及渲染。
        // 这里我们手动等待所有线程就绪，强制让出主线程给 UI 渲染
        let waitTime = 0;
        while (activeWorkerCount < totalWorkers && waitTime < 5000) {
            await new Promise(r => setTimeout(r, 100)); // 让出时间片处理 message 事件
            waitTime += 100;
        }

        // 视觉优化：强制显示最终线程状态并暂停一下，让用户看清
        UI.updateProgress(`引擎初始化完毕: ${totalWorkers}/${totalWorkers} 线程就绪`, 100);
        await new Promise(r => setTimeout(r, 500));

        UI.updateProgress("引擎准备就绪", 100);
        if (RUN_BTN) { RUN_BTN.disabled = false; RUN_BTN.innerText = "选择文件夹并开始"; }
        UI.setStep(2); // 进度条下方步骤切换
    } catch (e) { UI.writeLog("初始化失败: " + e.message); }
}
/**
 * 引擎下载逻辑：支持 Cache API 实现离线秒开
 */
async function fetchWithProgress(url, name, fixedSize) {
    const CACHE_NAME = 'm3u8-pro-engine-v1';
    
    try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResp = await cache.match(url);
        
        if (cachedResp) {
            UI.updateProgress(`🚀 发现本地离线引擎: ${name}`, 50);
            await new Promise(r => setTimeout(r, 300)); // 稍微展示一下提示
            const blob = await cachedResp.blob();
            UI.updateProgress(`✅ 本地引擎加载完毕`, 100);
            return URL.createObjectURL(blob);
        }
    } catch (e) {
        console.warn("Cache API 访问失败，回退到普通下载", e);
    }

    // 缓存未命中，执行网络下载
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
    
    const blob = new Blob(chunks, { type: 'application/wasm' });
    
    // 下载完成后写入缓存，供下次离线使用
    try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(url, new Response(blob));
        console.log("引擎已缓存至本地");
    } catch (e) { console.warn("缓存写入失败", e); }

    return URL.createObjectURL(blob);
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
            
            // 重置全局状态
            previousBatchesDuration = 0; 
            taskDuration = 0;

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

            // 解析 M3U8 并计算总时长、建立映射
            const m3u8Raw = await (await m3u8File.getFile()).text();
            const m3u8Info = parseM3u8Info(m3u8Raw);
            taskDuration = m3u8Info.total;
            const durationMap = m3u8Info.durationMap;
            
            UI.writeLog(`[分析] 视频总时长: ${taskDuration.toFixed(1)} 秒，切片数量: ${tsList.length}`);

            const CHUNK_LIMIT = 1024 * 1024 * 1024; // 1GB
            let batches = totalSize < 1.5 * CHUNK_LIMIT ? 
                          splitBatches(tsList, CHUNK_LIMIT, durationMap) : // 即使不分段也要走这个逻辑来计算时长
                          splitBatches(tsList, CHUNK_LIMIT, durationMap);
            
            // 如果不需要分段，splitBatches 也会返回一个 batch，逻辑通用

            try { await ffmpeg.createDir('index'); } catch(e){}
            for(const k of keyFiles) await safeWriteFile(`index/${k.name}`, new Uint8Array(await (await k.getFile()).arrayBuffer()));

            let totalIdx = 0;

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const partName = `Part_${i + 1}.mp4`;
                
                // 1. 写入文件阶段
                for (const ts of batch.files) {
                    totalIdx++;
                    
                    // 写入阶段只占前 5% 的进度
                    const writePct = Math.round((totalIdx / tsList.length) * 5);
                    UI.updateProgress(`准备数据: ${totalIdx} / ${tsList.length}`, writePct);

                    if (totalIdx % 50 === 0) await new Promise(r => setTimeout(r, 0));
                    await safeWriteFile(`index/${ts.handle.name}`, new Uint8Array(await (await ts.handle.getFile()).arrayBuffer()));
                }

                // 2. 合并阶段
                UI.updateProgress(`开始合并 (Part ${i+1})...`, 5 + Math.round((previousBatchesDuration / taskDuration) * 95));
                UI.writeLog(`[状态] 启动内核合并 (Part ${i+1}), 预计分段时长: ${batch.duration.toFixed(1)}s`);

                const currentNames = new Set(batch.files.map(t => t.handle.name));
                const filtered = m3u8Raw.split('\n').filter(l => l.includes('.ts') ? currentNames.has(l.trim().split('/').pop().split('?')[0]) : true).join('\n').replace(/URI="([^"]+)"/g, (m, p) => `URI="index/${p.split('/').pop()}"`);
                await safeWriteFile('temp.m3u8', new TextEncoder().encode(filtered));

                await ffmpeg.exec(['-allowed_extensions', 'ALL', '-i', 'temp.m3u8', '-c', 'copy', '-fflags', '+genpts+igndts', partName]);
                
                // 本分段完成，累加时长到全局
                previousBatchesDuration += batch.duration;

                const data = await ffmpeg.readFile(partName);
                UI.downloadFile(data, `${dir.name}_${partName}`);
                
                await ffmpeg.deleteFile(partName);
                for(const ts of batch.files) await ffmpeg.deleteFile(`index/${ts.handle.name}`);
            }
            UI.writeLog("🎉 任务完成");
            UI.updateProgress("任务完成", 100);
        } catch (e) { UI.writeLog("❌ 失败: " + e.message); }
        finally { runBtn.disabled = false; runBtn.innerText = "选择文件夹并开始"; UI.setStep(2); taskDuration = 0; previousBatchesDuration = 0; }
    };

    // 本地 MP4 拼合逻辑
    const mergeBtn = document.getElementById('mergeMp4Btn');
    if (mergeBtn) {
        mergeBtn.onclick = async () => {
            try {
                const files = await window.showOpenFilePicker({ multiple: true });
                if (!files || files.length === 0) return;

                // 1. 预先计算总大小，进行风险提示
                let totalSize = 0;
                for (const f of files) {
                    // showOpenFilePicker 返回的是 FileHandle，需要 getFile() 获取属性
                    // 这里为了性能，先不全读，只在循环里读，但为了预判大小，我们需要先遍历一遍
                    // 或者我们可以在下面的循环中累加，但那样就没法提前终止了。
                    // 鉴于 handle.getFile() 很快，我们先预检。
                    const fileData = await f.getFile();
                    totalSize += fileData.size;
                }

                const GB = 1024 * 1024 * 1024;
                if (totalSize > 2 * GB) {
                    const confirmMsg = `⚠️ 风险警告\n\n您选择的文件总大小为 ${(totalSize / GB).toFixed(2)} GB。\n\n浏览器环境处理超过 2GB 的文件极易导致内存溢出（OOM）崩溃。\n\n建议使用专业桌面软件处理此类大文件。\n\n是否仍要尝试？`;
                    if (!confirm(confirmMsg)) return;
                }

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
                
                UI.writeLog("[内核] 正在执行 concat 指令...");
                const ret = await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'Total_Merged.mp4']);
                
                if (ret !== 0) {
                    throw new Error(`内核进程异常退出 (Exit Code: ${ret})。可能是内存不足或文件格式不兼容。`);
                }

                const data = await ffmpeg.readFile('Total_Merged.mp4');
                UI.downloadFile(data, "合并结果_Full.mp4");
                UI.writeLog("✅ 拼合任务已完成！");
            } catch (e) { 
                UI.writeLog("❌ 拼合失败: " + e.message); 
                alert(`❌ 任务失败\n\n原因: ${e.message}\n\n如果是大文件合并失败，请尝试减少文件数量。`);
            }
            finally { mergeBtn.disabled = false; UI.updateProgress("就绪", 0); }
        };
    }
});

// 分批函数改进：同时计算每批次的时长
function splitBatches(list, limit, durationMap) {
    let res = []; 
    let curFiles = []; 
    let curSize = 0;
    let curDuration = 0;
    
    // 如果没有找到映射（比如文件名不匹配），给一个默认值 0，防止 NaN
    const getDur = (name) => durationMap.get(name) || 0;

    for(const t of list) {
        curFiles.push(t); 
        curSize += t.size;
        curDuration += getDur(t.handle.name);

        if(curSize >= limit) { 
            res.push({ files: curFiles, duration: curDuration }); 
            curFiles = []; 
            curSize = 0;
            curDuration = 0;
        }
    }
    if(curFiles.length) {
        res.push({ files: curFiles, duration: curDuration });
    }
    return res;
}
initCore();