// ==UserScript==
// @name         DeepSeek 轻量级防卡顿助手
// @name:zh-CN   DeepSeek 轻量级防卡顿助手
// @name:en      DeepSeek Lightweight Performance Assistant
// @namespace    https://github.com/HanJun27/DeepSeek-deepseek-performance-assistant
// @version      2.1
// @description  监控内存、自动清理、智能刷新，防止DeepSeek网页版卡顿崩溃
// @description:zh-CN 监控内存、自动清理、智能刷新，防止DeepSeek网页版卡顿崩溃
// @description:en  Monitor memory, auto-clean, smart refresh to prevent DeepSeek web from lagging
// @author       你的名字
// @match        https://chat.deepseek.com/*
// @match        https://www.deepseek.com/*
// @icon         https://chat.deepseek.com/favicon.ico
// @license      MIT
// @grant        none
// @run-at       document-end
// @homepageURL  https://github.com/HanJun27/DeepSeek-deepseek-performance-assistant
// @supportURL   https://github.com/HanJun27/DeepSeek-deepseek-performance-assistant/issues
// @downloadURL  https://raw.githubusercontent.com/HanJun27/DeepSeek-deepseek-performance-assistant/main/deepseek-performance-assistant.user.js
// @updateURL    https://raw.githubusercontent.com/HanJun27/DeepSeek-deepseek-performance-assistant/main/deepseek-performance-assistant.user.js
// ==/UserScript==

// ==UserScript==
// @name         DeepSeek 轻量级防卡顿助手
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  监控内存、自动清理、智能刷新，防止DeepSeek卡顿崩溃
// @match        https://chat.deepseek.com/*
// @match        https://www.deepseek.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        // 内存阈值（单位：MB）
        MEMORY_WARNING: 500,      // 500MB警告
        MEMORY_CRITICAL: 700,     // 700MB自动刷新
        MEMORY_CLEAN: 300,        // 300MB以上开始清理
        
        // 时间阈值（单位：分钟）
        SESSION_TIMEOUT: 45,       // 45分钟提醒刷新
        AUTO_REFRESH_TIME: 60,     // 60分钟自动刷新
        
        // 消息数量阈值
        MESSAGE_WARNING: 100,      // 100条消息提醒
        MESSAGE_CRITICAL: 150,     // 150条自动刷新
        
        // 清理选项
        CLEAN_INTERVAL: 30000,      // 30秒检查一次
        DEBUG: true
    };

    // ==================== 状态监控 ====================
    const State = {
        startTime: Date.now(),
        lastCleanTime: Date.now(),
        messageCount: 0,
        refreshCount: 0,
        warningShown: false
    };

    function log(...args) {
        if (CONFIG.DEBUG) {
            console.log('[DeepSeek助手]', ...args);
        }
    }

    // ==================== 内存监控 ====================
    const MemoryMonitor = {
        getUsage() {
            if (performance.memory) {
                return Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
            }
            return null;
        },

        check() {
            const usage = this.getUsage();
            if (!usage) return;

            if (usage > CONFIG.MEMORY_CRITICAL) {
                this.handleCritical(usage);
            } else if (usage > CONFIG.MEMORY_WARNING) {
                this.handleWarning(usage);
            } else if (usage > CONFIG.MEMORY_CLEAN) {
                this.clean();
            }
        },

        handleWarning(usage) {
            if (State.warningShown) return;
            
            this.showToast(
                `⚠️ 内存使用较高 (${usage}MB)`,
                '建议刷新页面释放内存',
                'warning'
            );
            State.warningShown = true;
        },

        handleCritical(usage) {
            this.showToast(
                `🔥 内存使用过高 (${usage}MB)`,
                '10秒后自动刷新...',
                'critical',
                () => {
                    log('用户取消自动刷新');
                }
            );

            setTimeout(() => {
                if (confirm('内存使用过高，是否刷新页面？')) {
                    location.reload();
                }
            }, 10000);
        },

        clean() {
            const now = Date.now();
            if (now - State.lastCleanTime < 60000) return; // 1分钟最多清理一次
            
            State.lastCleanTime = now;
            log('执行内存清理...');

            // 1. 清理离屏DOM
            this.cleanOffscreenElements();

            // 2. 清理Canvas
            this.cleanCanvas();

            // 3. 触发垃圾回收（如果可用）
            if (window.gc) {
                try {
                    window.gc();
                    log('手动GC触发');
                } catch (e) {}
            }
        },

        cleanOffscreenElements() {
            const messages = document.querySelectorAll('.ds-message, [class*="message"]');
            let cleaned = 0;

            messages.forEach(msg => {
                const rect = msg.getBoundingClientRect();
                // 如果元素在屏幕外很远
                if (rect.bottom < -1000 || rect.top > window.innerHeight + 1000) {
                    // 简化DOM结构
                    if (msg.children.length > 3) {
                        // 只保留前3个子元素
                        while (msg.children.length > 3) {
                            msg.removeChild(msg.lastChild);
                        }
                        cleaned++;
                    }
                }
            });

            if (cleaned > 0) {
                log(`清理了 ${cleaned} 个离屏元素`);
            }
        },

        cleanCanvas() {
            const canvases = document.querySelectorAll('canvas');
            canvases.forEach(canvas => {
                if (canvas.width > 1000 || canvas.height > 1000) {
                    // 重置Canvas大小
                    canvas.width = 100;
                    canvas.height = 100;
                    
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                }
            });
        },

        showToast(title, message, type = 'info', onCancel) {
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                background: ${type === 'critical' ? '#ff4444' : '#ff8c00'};
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                z-index: 999999;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                font-family: system-ui;
                min-width: 250px;
                animation: slideIn 0.3s ease;
                cursor: pointer;
            `;

            toast.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 5px;">${title}</div>
                <div style="font-size: 13px; opacity: 0.9;">${message}</div>
                <div style="margin-top: 10px; font-size: 11px; text-align: right;">点击刷新 | 3秒后关闭</div>
            `;

            toast.onclick = () => {
                location.reload();
            };

            document.body.appendChild(toast);

            // 添加动画
            if (!document.getElementById('ds-toast-style')) {
                const style = document.createElement('style');
                style.id = 'ds-toast-style';
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            // 3秒后自动消失
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.style.animation = 'slideIn 0.3s reverse';
                    setTimeout(() => toast.remove(), 300);
                }
            }, 3000);
        }
    };

    // ==================== 消息计数器 ====================
    const MessageCounter = {
        count() {
            const messages = document.querySelectorAll('.ds-message, [class*="message"]');
            return messages.length;
        },

        check() {
            const count = this.count();
            if (count === State.messageCount) return;

            State.messageCount = count;
            log(`当前消息数: ${count}`);

            if (count > CONFIG.MESSAGE_CRITICAL) {
                this.showWarning(`消息数量过多 (${count}条)`, '建议开始新对话');
            } else if (count > CONFIG.MESSAGE_WARNING) {
                if (count % 20 === 0) { // 每20条提醒一次
                    this.showTip(`已有 ${count} 条消息`, '长对话可能影响性能');
                }
            }
        },

        showWarning(title, message) {
            const tip = document.createElement('div');
            tip.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #2196F3;
                color: white;
                padding: 12px 18px;
                border-radius: 8px;
                z-index: 999998;
                font-size: 13px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                cursor: pointer;
                animation: fadeIn 0.3s;
            `;
            tip.innerHTML = `${title}<br><small>${message}</small>`;
            tip.onclick = () => {
                if (confirm('开始新对话可以提升性能，确定吗？')) {
                    location.href = 'https://chat.deepseek.com/';
                }
            };

            document.body.appendChild(tip);
            setTimeout(() => tip.remove(), 5000);
        },

        showTip(title, message) {
            const tip = document.createElement('div');
            tip.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                background: rgba(0,0,0,0.6);
                color: white;
                padding: 8px 12px;
                border-radius: 20px;
                z-index: 999997;
                font-size: 12px;
                backdrop-filter: blur(5px);
            `;
            tip.textContent = `${title} - ${message}`;
            
            document.body.appendChild(tip);
            setTimeout(() => tip.remove(), 3000);
        }
    };

    // ==================== 定时器管理 ====================
    const TimerManager = {
        check() {
            const minutes = Math.floor((Date.now() - State.startTime) / 60000);
            
            if (minutes >= CONFIG.AUTO_REFRESH_TIME) {
                this.autoRefresh();
            } else if (minutes >= CONFIG.SESSION_TIMEOUT) {
                this.showRefreshReminder(minutes);
            }
        },

        showRefreshReminder(minutes) {
            const reminder = document.createElement('div');
            reminder.style.cssText = `
                position: fixed;
                top: 140px;
                right: 20px;
                background: #4CAF50;
                color: white;
                padding: 10px 15px;
                border-radius: 30px;
                z-index: 999999;
                font-size: 13px;
                cursor: pointer;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            `;
            reminder.innerHTML = `⏰ 已运行 ${minutes} 分钟<br><small>点击刷新保持流畅</small>`;
            reminder.onclick = () => location.reload();

            document.body.appendChild(reminder);
            setTimeout(() => reminder.remove(), 10000);
        },

        autoRefresh() {
            if (confirm('为保持最佳性能，建议刷新页面。是否现在刷新？')) {
                location.reload();
            } else {
                // 重置计时器
                State.startTime = Date.now();
            }
        }
    };

    // ==================== 性能面板 ====================
    class PerformancePanel {
        constructor() {
            this.panel = null;
            this.create();
        }

        create() {
            this.panel = document.createElement('div');
            this.panel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(30, 30, 30, 0.95);
                color: #fff;
                padding: 15px;
                border-radius: 10px;
                font-family: monospace;
                font-size: 12px;
                z-index: 999996;
                backdrop-filter: blur(5px);
                border: 1px solid #444;
                min-width: 220px;
                cursor: move;
                user-select: none;
                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                border-left: 3px solid #4CAF50;
            `;

            this.update();
            document.body.appendChild(this.panel);
            this.makeDraggable();
        }

        update() {
            const minutes = Math.floor((Date.now() - State.startTime) / 60000);
            const memory = MemoryMonitor.getUsage();
            const messages = MessageCounter.count();

            // 根据内存使用设置颜色
            let memoryColor = '#4CAF50';
            if (memory > CONFIG.MEMORY_WARNING) memoryColor = '#ff8c00';
            if (memory > CONFIG.MEMORY_CRITICAL) memoryColor = '#ff4444';

            // 根据消息数设置颜色
            let msgColor = '#fff';
            if (messages > CONFIG.MESSAGE_WARNING) msgColor = '#ff8c00';
            if (messages > CONFIG.MESSAGE_CRITICAL) msgColor = '#ff4444';

            this.panel.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #444; padding-bottom: 8px;">
                    <span style="color: #4CAF50; font-weight: bold;">⚡ DeepSeek 助手</span>
                    <span style="color: #aaa; font-size: 11px; cursor: pointer;" onclick="location.reload()">↻ 刷新</span>
                </div>
                <div style="display: grid; grid-template-columns: 70px 1fr 30px; gap: 8px; align-items: center;">
                    <span style="color: #aaa;">运行时间:</span>
                    <span>${Math.floor(minutes/60)}h ${minutes%60}m</span>
                    <span style="color: #666; font-size: 10px;">⏱️</span>
                    
                    <span style="color: #aaa;">内存使用:</span>
                    <span style="color: ${memoryColor}; font-weight: bold;">${memory || '?'} MB</span>
                    <span style="color: #666; font-size: 10px;">${memory ? Math.round(memory/1024*100)/100 + 'GB' : ''}</span>
                    
                    <span style="color: #aaa;">消息数量:</span>
                    <span style="color: ${msgColor}; font-weight: bold;">${messages}</span>
                    <span style="color: #666; font-size: 10px;">条</span>
                    
                    <span style="color: #aaa;">刷新次数:</span>
                    <span>${State.refreshCount}</span>
                    <span style="color: #666; font-size: 10px;">次</span>
                </div>
                <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #444; font-size: 10px; color: #666; display: flex; justify-content: space-between;">
                    <span>🔄 自动清理中</span>
                    <span>${new Date().toLocaleTimeString()}</span>
                </div>
            `;

            setTimeout(() => this.update(), 1000);
        }

        makeDraggable() {
            let isDragging = false;
            let startX, startY, startRight, startTop;

            this.panel.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'SPAN') return;
                
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                
                // 获取当前right和top值
                const rect = this.panel.getBoundingClientRect();
                startRight = window.innerWidth - rect.right;
                startTop = rect.top;
                
                this.panel.style.cursor = 'grabbing';
                this.panel.style.transition = 'none';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                // 计算新的right和top
                const newRight = Math.max(10, Math.min(window.innerWidth - 300, startRight - dx));
                const newTop = Math.max(10, Math.min(window.innerHeight - 200, startTop + dy));
                
                this.panel.style.right = newRight + 'px';
                this.panel.style.top = newTop + 'px';
                this.panel.style.left = 'auto';
                this.panel.style.bottom = 'auto';
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    this.panel.style.cursor = 'move';
                    this.panel.style.transition = 'all 0.1s ease';
                }
            });
        }
    }

    // ==================== 快速操作菜单 ====================
    class QuickMenu {
        constructor() {
            this.create();
        }

        create() {
            const menu = document.createElement('div');
            menu.style.cssText = `
                position: fixed;
                top: 80px;
                right: 260px;
                display: flex;
                flex-direction: column;
                gap: 5px;
                z-index: 999995;
            `;

            const buttons = [
                { icon: '↻', text: '刷新页面', action: () => location.reload(), color: '#4CAF50' },
                { icon: '✨', text: '新建对话', action: () => location.href = 'https://chat.deepseek.com/', color: '#2196F3' },
                { icon: '🧹', text: '立即清理', action: () => MemoryMonitor.clean(), color: '#ff8c00' },
                { icon: '📊', text: '详细状态', action: () => this.showDetails(), color: '#9C27B0' }
            ];

            buttons.forEach(btn => {
                const button = document.createElement('button');
                button.innerHTML = `${btn.icon} ${btn.text}`;
                button.style.cssText = `
                    background: rgba(30, 30, 30, 0.95);
                    color: white;
                    border: none;
                    border-left: 3px solid ${btn.color};
                    padding: 8px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    backdrop-filter: blur(5px);
                    transition: all 0.2s;
                    text-align: left;
                    width: 100px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                `;
                button.onmouseenter = () => {
                    button.style.background = btn.color;
                    button.style.transform = 'translateX(-3px)';
                };
                button.onmouseleave = () => {
                    button.style.background = 'rgba(30, 30, 30, 0.95)';
                    button.style.transform = 'translateX(0)';
                };
                button.onclick = btn.action;
                
                menu.appendChild(button);
            });

            document.body.appendChild(menu);
        }

        showDetails() {
            const minutes = Math.floor((Date.now() - State.startTime) / 60000);
            const memory = MemoryMonitor.getUsage();
            const messages = MessageCounter.count();
            
            alert(`
📊 DeepSeek 详细状态

⏱️ 运行时间: ${Math.floor(minutes/60)}小时 ${minutes%60}分钟
💾 内存使用: ${memory || '?'} MB
💬 消息数量: ${messages} 条
🔄 刷新次数: ${State.refreshCount} 次

📌 建议:
${memory > CONFIG.MEMORY_WARNING ? '- 内存较高，建议刷新' : '- 内存状态良好'}
${messages > CONFIG.MESSAGE_WARNING ? '- 消息较多，考虑新对话' : '- 消息数量适中'}
${minutes > CONFIG.SESSION_TIMEOUT ? '- 运行较久，可刷新保持流畅' : '- 运行时间正常'}

点击确定继续使用
            `);
        }
    }

    // ==================== 启动 ====================
    function init() {
        log('轻量级防卡顿助手启动 (面板在右上角)');

        // 延迟启动，等待页面加载
        setTimeout(() => {
            // 创建面板
            new PerformancePanel();
            new QuickMenu();

            // 定期检查
            setInterval(() => {
                MemoryMonitor.check();
                MessageCounter.check();
                TimerManager.check();
            }, CONFIG.CLEAN_INTERVAL);

            // 监听页面关闭
            window.addEventListener('beforeunload', () => {
                State.refreshCount++;
                log(`页面刷新，总计刷新 ${State.refreshCount} 次`);
            });

            log('初始化完成 - 面板在右上角');
        }, 3000);
    }

    // 启动
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();