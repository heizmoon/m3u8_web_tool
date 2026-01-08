/**
 * UI 控制器：专门负责界面交互和反馈
 */
const UI = {
    updateProgress(name, pct) {
        document.getElementById('task-name').innerText = name;
        document.getElementById('task-pct').innerText = pct + '%';
        document.getElementById('task-bar').style.width = pct + '%';
    },
    updateStats(time, size, speed) {
        document.getElementById('stat-time').innerText = time;
        document.getElementById('stat-size').innerText = size;
        document.getElementById('stat-speed').innerText = speed;
    },
    setStep(stepNumber) {
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        document.getElementById(`step-${stepNumber}`).classList.add('active');
    },
    writeLog(msg) {
        const logEl = document.getElementById('log');
        logEl.innerText += `\n> ${msg}`;
        logEl.scrollTop = logEl.scrollHeight;
    }
};

// 绑定 Tab 切换
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = (e) => {
        document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
    };
});