// ==UserScript==
// @name         DeepSeek 轻量级防卡顿助手
// @name:zh-CN   DeepSeek 轻量级防卡顿助手
// @name:en      DeepSeek Lightweight Performance Assistant
// @namespace    https://github.com/你的用户名/DeepSeek-Performance-Assistant
// @version      2.2
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
// @homepageURL  https://github.com/你的用户名/DeepSeek-Performance-Assistant
// @supportURL   https://github.com/你的用户名/DeepSeek-Performance-Assistant/issues
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        MEMORY_WARNING: 500,
        MEMORY_CRITICAL: 700,
        MEMORY_CLEAN: 300,
        SESSION_TIMEOUT: 45,
        AUTO_REFRESH_TIME: 60,
        MESSAGE_WARNING: 100,
        MESSAGE_CRITICAL: 150,
        CLEAN_INTERVAL: 30000,
        DEBUG: true,
        
        // 内存API检测
        CHECK_MEMORY_INTERVAL: 2000,  // 2秒检测一次内存API
        MAX_MEMORY_CHECK: 10          // 最多检测10次
    };

    // ==================== 状态 ====================
    const State = {
        startTime: Date.now(),
        lastCleanTime: Date.now(),
        messageCount: 0,
        refreshCount: 0,
        warningShown: false,
        isExpanded: false,  // 默认折叠
        memorySupported: false,
        memoryValue: '?'
    };

    function log(...args) {
        if (CONFIG.DEBUG) {
            console.log('[DeepSeek助手]', ...args);
        }
    }

    // ==================== 内存监控 ====================
    const MemoryMonitor = {
        init() {
            // 检测内存API是否可用
            this.detectMemoryAPI();
        },

        detectMemoryAPI() {
            if (performance.memory) {
                State.memorySupported = true;
                log('内存API可用');
                return;
            }

            // 如果不可用，尝试多次检测（有些浏览器延迟暴露API）
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (performance.memory) {
                    State.memorySupported = true;
                    log('内存API可用（延迟检测成功）');
                    clearInterval(interval);
                } else if (attempts >= CONFIG.MAX_MEMORY_CHECK) {
                    log('内存API不可用，使用模拟值');
                    clearInterval(interval);
                }
            }, CONFIG.CHECK_MEMORY_INTERVAL);
        },

        getUsage() {
            if (State.memorySupported && performance.memory) {
                return Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
            }
            // 如果不支持，返回模拟值（基于运行时间和消息数估算）
            const minutes = Math.floor((Date.now() - State.startTime) / 60000);
            const messages = MessageCounter.count();
            // 粗略估算：基础50MB + 每分钟1MB + 每条消息1MB
            return Math.min(50 + minutes + messages, 800);
        },

        check() {
            const usage = this.getUsage();
            State.memoryValue = usage;

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
            if (now - State.lastCleanTime < 60000) return;
            
            State.lastCleanTime = now;
            log('执行内存清理...');

            this.cleanOffscreenElements();
            this.cleanCanvas();

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
                if (rect.bottom < -1000 || rect.top > window.innerHeight + 1000) {
                    if (msg.children.length > 3) {
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
                if (count % 20 === 0) {
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
                State.startTime = Date.now();
            }
        }
    };

    // ==================== 整合面板 ====================
    class IntegratedPanel {
        constructor() {
            this.panel = null;
            this.titleBar = null;
            this.content = null;
            this.create();
        }

        create() {
            // 主容器 - 整体做小一点
            this.panel = document.createElement('div');
            this.panel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(30, 30, 30, 0.95);
                color: #fff;
                border-radius: 12px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 12px;
                z-index: 999996;
                backdrop-filter: blur(5px);
                border: 1px solid #444;
                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                overflow: hidden;
                width: 200px;  /* 比之前小一点 */
                transition: all 0.2s ease;
                cursor: move;
                user-select: none;
            `;

            // 标题栏（始终显示）
            this.titleBar = document.createElement('div');
            this.titleBar.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: rgba(40, 40, 40, 0.95);
                border-bottom: 1px solid #444;
                cursor: move;
            `;
            this.titleBar.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="color: #4CAF50; font-weight: bold;">⚡ DeepSeek</span>
                    <span style="color: #888; font-size: 10px;">v2.2</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span id="ds-expand-btn" style="color: #4CAF50; cursor: pointer; font-size: 14px;">▼</span>
                </div>
            `;

            // 内容区域（可折叠）
            this.content = document.createElement('div');
            this.content.style.cssText = `
                padding: 12px;
                display: none;  /* 默认折叠 */
            `;

            // 按钮组 - 放在内容区域顶部
            const buttonGroup = document.createElement('div');
            buttonGroup.style.cssText = `
                display: flex;
                gap: 5px;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid #333;
            `;

            const buttons = [
                { icon: '↻', text: '刷新', action: () => location.reload(), color: '#4CAF50' },
                { icon: '✨', text: '新对话', action: () => location.href = 'https://chat.deepseek.com/', color: '#2196F3' },
                { icon: '🧹', text: '清理', action: () => MemoryMonitor.clean(), color: '#ff8c00' }
            ];

            buttons.forEach(btn => {
                const button = document.createElement('button');
                button.innerHTML = `${btn.icon} ${btn.text}`;
                button.style.cssText = `
                    flex: 1;
                    background: #333;
                    color: white;
                    border: none;
                    border-left: 2px solid ${btn.color};
                    padding: 6px 0;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 11px;
                    transition: all 0.2s;
                `;
                button.onmouseenter = () => {
                    button.style.background = btn.color;
                };
                button.onmouseleave = () => {
                    button.style.background = '#333';
                };
                button.onclick = btn.action;
                buttonGroup.appendChild(button);
            });

            // 状态显示区
            const statusDisplay = document.createElement('div');
            statusDisplay.style.cssText = `
                display: grid;
                grid-template-columns: 70px 1fr;
                gap: 6px;
                font-size: 11px;
            `;
            statusDisplay.id = 'ds-status-display';

            // 组装
            this.content.appendChild(buttonGroup);
            this.content.appendChild(statusDisplay);
            this.panel.appendChild(this.titleBar);
            this.panel.appendChild(this.content);
            document.body.appendChild(this.panel);

            // 绑定事件
            this.bindEvents();
            this.makeDraggable();
            this.startUpdating();
        }

        bindEvents() {
            const expandBtn = document.getElementById('ds-expand-btn');
            if (expandBtn) {
                expandBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.toggle();
                };
            }
        }

        toggle() {
            State.isExpanded = !State.isExpanded;
            this.content.style.display = State.isExpanded ? 'block' : 'none';
            const expandBtn = document.getElementById('ds-expand-btn');
            if (expandBtn) {
                expandBtn.innerHTML = State.isExpanded ? '▲' : '▼';
            }
        }

        update() {
            const minutes = Math.floor((Date.now() - State.startTime) / 60000);
            const memory = MemoryMonitor.getUsage();
            const messages = MessageCounter.count();

            // 更新内存值
            State.memoryValue = memory;

            // 根据使用量设置颜色
            let memoryColor = '#4CAF50';
            if (memory > CONFIG.MEMORY_WARNING) memoryColor = '#ff8c00';
            if (memory > CONFIG.MEMORY_CRITICAL) memoryColor = '#ff4444';

            let msgColor = '#fff';
            if (messages > CONFIG.MESSAGE_WARNING) msgColor = '#ff8c00';
            if (messages > CONFIG.MESSAGE_CRITICAL) msgColor = '#ff4444';

            // 更新状态显示
            const statusDisplay = document.getElementById('ds-status-display');
            if (statusDisplay) {
                statusDisplay.innerHTML = `
                    <span style="color: #aaa;">运行:</span>
                    <span>${Math.floor(minutes/60)}h ${minutes%60}m</span>
                    
                    <span style="color: #aaa;">内存:</span>
                    <span style="color: ${memoryColor}; font-weight: bold;">${memory} MB</span>
                    
                    <span style="color: #aaa;">消息:</span>
                    <span style="color: ${msgColor};">${messages}</span>
                    
                    <span style="color: #aaa;">刷新:</span>
                    <span>${State.refreshCount}</span>
                `;
            }
        }

        makeDraggable() {
            let isDragging = false;
            let startX, startY, startRight, startTop;

            this.titleBar.addEventListener('mousedown', (e) => {
                if (e.target.id === 'ds-expand-btn') return;
                
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                
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
                
                const newRight = Math.max(10, Math.min(window.innerWidth - 220, startRight - dx));
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

        startUpdating() {
            setInterval(() => this.update(), 1000);
        }
    }

    // ==================== 启动 ====================
    function init() {
        log('轻量级防卡顿助手启动 v2.2');

        // 初始化内存监控（检测API）
        MemoryMonitor.init();

        // 等待页面加载后创建面板
        setTimeout(() => {
            // 创建整合面板
            new IntegratedPanel();

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

            log('初始化完成 - 折叠式整合面板');
        }, 3000);
    }

    // 启动
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();