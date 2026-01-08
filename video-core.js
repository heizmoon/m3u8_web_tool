/**
 * video-core.js
 * 职责：负责 FFmpeg 运算、文件处理、递归扫描
 */
let ffmpeg = null;

async function initCore() {
    try {
        const { FFmpeg } = window.FFmpegWASM || window.FFmpeg;
        ffmpeg = new FFmpeg();
        
        ffmpeg.on('log', ({ message }) => {
            UI.writeLog(`[内核] ${message}`);
            if (message.includes('frame=')) {
                UI.updateStatsFromLog(message);
            }
        });

        await loadWasmComponents();
        
        document.getElementById('runBtn').disabled = false;
        document.getElementById('runBtn').innerText = "选择文件夹并开始";
        UI.setStep(2); // 切换到第二步
    } catch (e) {
        UI.writeLog("核心初始化失败: " + e.message);
    }
}

async function loadWasmComponents() {
    // 修复点：确保 fetchWithProgress 内部变量正确
    const wasmURL = await fetchWithProgress('./ffmpeg-core.wasm', '核心引擎', 32000000);
    const coreURL = await fetchWithProgress('./ffmpeg-core.js', '调度器', 100000);
    const workerURL = await fetchWithProgress('./ffmpeg-core.worker.js', '多线程库', 100000);

    await ffmpeg.load({ coreURL, wasmURL, workerURL });
    UI.updateProgress("✅ 引擎就绪", 100);
}

async function fetchWithProgress(url, name, estSize) {
    const resp = await fetch(url);
    const reader = resp.body.getReader();
    const total = +resp.headers.get('Content-Length') || estSize;
    let loaded = 0;
    let chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        // 修复：定义并计算百分比
        const pct = Math.min(Math.round((loaded / total) * 100), 99);
        UI.updateProgress(`下载 ${name}`, pct);
    }
    return URL.createObjectURL(new Blob(chunks));
}

// 递归扫描目录
async function scanDirectory(dirHandle, tsList, keyFiles) {
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            if (entry.name.endsWith('.ts')) tsList.push(entry);
            if (entry.name.endsWith('.key')) keyFiles.push(entry);
            if (entry.name.endsWith('.m3u8')) window.currentM3u8 = entry;
        } else {
            await scanDirectory(entry, tsList, keyFiles);
        }
    }
}

// 绑定 M3U8 合并事件
document.getElementById('runBtn').onclick = async () => {
    try {
        const dirHandle = await window.showDirectoryPicker();
        UI.setStep(3); // 切换到第三步
        UI.writeLog(`正在扫描: ${dirHandle.name}`);

        let tsList = [];
        let keyFiles = [];
        await scanDirectory(dirHandle, tsList, keyFiles);
        
        if (!window.currentM3u8) throw new Error("未找到 .m3u8 文件");
        tsList.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));

        const m3u8Content = await (await window.currentM3u8.getFile()).text();
        
        // 写入 Key 文件
        try { await ffmpeg.createDir('index'); } catch(e){}
        for(const k of keyFiles) {
            await ffmpeg.writeFile(`index/${k.name}`, new Uint8Array(await (await k.getFile()).arrayBuffer()));
        }

        // 分段导出逻辑 (规避 2GB 内存墙)
        const batchSize = 800;
        for (let i = 0; i < tsList.length; i += batchSize) {
            const batch = tsList.slice(i, i + batchSize);
            const partName = `Part_${Math.floor(i/batchSize) + 1}.mp4`;
            UI.writeLog(`正在处理: ${partName}`);

            for (const f of batch) {
                await ffmpeg.writeFile(`index/${f.name}`, new Uint8Array(await (await f.getFile()).arrayBuffer()));
            }
            
            await ffmpeg.writeFile('temp.m3u8', new TextEncoder().encode(m3u8Content));
            await ffmpeg.exec(['-allowed_extensions', 'ALL', '-i', 'temp.m3u8', '-c', 'copy', partName]);
            
            const data = await ffmpeg.readFile(partName);
            UI.downloadFile(data, `${dirHandle.name}_${partName}`);
            
            // 清理内存
            await ffmpeg.deleteFile(partName);
            for(const f of batch) await ffmpeg.deleteFile(`index/${f.name}`);
        }
        UI.writeLog("🎉 任务完成！");
    } catch (e) { UI.writeLog("操作中断: " + e.message); }
};

// 绑定本地 MP4 拼合事件
document.getElementById('mergeMp4Btn').onclick = async () => {
    try {
        const files = await window.showOpenFilePicker({ multiple: true });
        UI.writeLog("🔗 正在进行无损拼合...");
        let listTxt = "";
        for (let i = 0; i < files.length; i++) {
            const f = await files[i].getFile();
            const name = `m${i}.mp4`;
            await ffmpeg.writeFile(name, new Uint8Array(await f.arrayBuffer()));
            listTxt += `file '${name}'\n`;
        }
        await ffmpeg.writeFile('list.txt', new TextEncoder().encode(listTxt));
        await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'final.mp4']);
        const data = await ffmpeg.readFile('final.mp4');
        UI.downloadFile(data, "合并完成_Total.mp4");
        UI.writeLog("✅ 全体拼合成功！");
    } catch (e) { UI.writeLog("拼合失败: " + e.message); }
};

initCore();