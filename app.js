// Constants
const EBBINGHAUS_INTERVALS = [
    5 * 60 * 1000,          // 5 minutes
    30 * 60 * 1000,         // 30 minutes
    12 * 60 * 60 * 1000,    // 12 hours
    24 * 60 * 60 * 1000,    // 1 day
    2 * 24 * 60 * 60 * 1000, // 2 days
    4 * 24 * 60 * 60 * 1000, // 4 days
    7 * 24 * 60 * 60 * 1000, // 7 days
    15 * 24 * 60 * 60 * 1000 // 15 days
];

// State
let currentUser = null;
let words = [];
let currentView = 'add';
let calendarMode = 'month'; // 'year', 'month', 'day'
let calendarDate = new Date();
let reviewQueue = [];
let currentReviewIndex = 0;
let selectedReviewMode = 'en-zh';
let studyIndex = 0;
let editingWordId = null;
let isFreeStudyMode = false;

// Initialize Lucide Icons
lucide.createIcons();

// --- Auth Management ---
function handleLogin() {
    const username = document.getElementById('auth-username').value.trim();
    if (!username) {
        showNotification('请输入名称', 'alert-circle');
        return;
    }

    const userData = JSON.parse(localStorage.getItem(`user_${username}`)) || {
        username: username,
        displayName: username,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
        words: []
    };

    currentUser = userData;
    words = userData.words;
    
    // Save current user to session
    localStorage.setItem('current_user_session', username);
    localStorage.setItem(`user_${username}`, JSON.stringify(currentUser));

    updateProfileUI();
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    
    switchView('add');
    showNotification(`欢迎回来, ${currentUser.displayName}`, 'smile');
}

function handleLogout() {
    saveUserData();
    localStorage.removeItem('current_user_session');
    currentUser = null;
    words = [];
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    closeProfileModal();
}

function updateProfileUI() {
    document.getElementById('user-display-name').innerText = currentUser.displayName;
    document.getElementById('user-avatar').src = currentUser.avatar;
}

function saveUserData() {
    if (currentUser) {
        currentUser.words = words;
        localStorage.setItem(`user_${currentUser.username}`, JSON.stringify(currentUser));
    }
}

// --- Profile Edit ---
function openProfileModal() {
    document.getElementById('edit-profile-name').value = currentUser.displayName;
    document.getElementById('edit-avatar-preview').src = currentUser.avatar;
    
    const modal = document.getElementById('profile-modal');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.children[0].classList.remove('scale-95');
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.children[0].classList.add('scale-95');
}

function saveProfile() {
    const newName = document.getElementById('edit-profile-name').value.trim();
    if (!newName) return;
    
    currentUser.displayName = newName;
    // Avatar is updated via seed or other selection (simplified for now)
    currentUser.avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${newName}`;
    
    saveUserData();
    updateProfileUI();
    closeProfileModal();
    showNotification('资料已更新', 'check-circle');
}

// --- View Management ---
function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${view}`).classList.remove('hidden');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-100');
        btn.classList.add('text-slate-600');
    });
    const activeBtn = document.getElementById(`btn-${view}`);
    if (activeBtn) {
        activeBtn.classList.add('bg-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-100');
        activeBtn.classList.remove('text-slate-600');
    }

    if (view === 'list') renderWordList();
    if (view === 'calendar') renderCalendar();
    if (view === 'study') {
        setStudyTab('browse');
        renderStudyWord();
    }
    updateStats();

    // Auto close sidebar on mobile after switching view
    if (window.innerWidth < 1024) {
        toggleSidebar(false);
    }
}

// --- Mobile Sidebar Toggle ---
function toggleSidebar(show) {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (show) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('opacity-0', 'pointer-events-none');
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('opacity-0', 'pointer-events-none');
    }
}

// --- Word Management ---
function updateExternalLinks(word) {
    const youdaoLink = document.getElementById('link-youdao');
    const collinsLink = document.getElementById('link-collins');
    if (!word) return;
    
    youdaoLink.href = `https://www.youdao.com/w/eng/${word}`;
    youdaoLink.classList.remove('hidden');
    collinsLink.href = `https://www.collinsdictionary.com/dictionary/english-chinese/${word}`;
    collinsLink.classList.remove('hidden');
}

async function translateWord() {
    // This function now updates links, jumps, and checks spelling
    const wordInput = document.getElementById('input-word');
    const translationInput = document.getElementById('input-translation');
    const suggestionBox = document.getElementById('spell-suggestion-box');
    let word = wordInput.value.trim().toLowerCase();
    
    if (!word) {
        suggestionBox.classList.add('hidden');
        return;
    }
    
    wordInput.value = word;
    updateExternalLinks(word);
    translationInput.focus();

    // Check spelling via Datamuse API (approximate spelling/sounds like)
    try {
        const response = await fetch(`https://api.datamuse.com/words?sp=${word}&max=1`);
        const data = await response.json();
        
        // If the exact word isn't found or is slightly different, ask for suggestions
        if (data.length === 0 || data[0].word !== word) {
            const suggestRes = await fetch(`https://api.datamuse.com/words?sp=${word.slice(0,-1)}*&max=3`);
            // Better yet, use 'sl' (sounds like) or 'sp' with wildcards
            const correctionRes = await fetch(`https://api.datamuse.com/words?sl=${word}&max=3`);
            const suggestions = await correctionRes.json();
            
            if (suggestions.length > 0) {
                renderSuggestions(suggestions);
            } else {
                suggestionBox.classList.add('hidden');
            }
        } else {
            suggestionBox.classList.add('hidden');
        }
    } catch (err) {
        console.error('Spell check failed', err);
    }
}

function renderSuggestions(suggestions) {
    const box = document.getElementById('spell-suggestion-box');
    const list = document.getElementById('suggestion-list');
    
    list.innerHTML = suggestions.map(s => `
        <button onclick="applySuggestion('${s.word}')" class="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-600 hover:text-white transition-all border border-rose-100">
            ${s.word}
        </button>
    `).join('');
    
    box.classList.remove('hidden');
}

function applySuggestion(word) {
    const wordInput = document.getElementById('input-word');
    wordInput.value = word;
    document.getElementById('spell-suggestion-box').classList.add('hidden');
    translateWord(); // Re-run to update links for the corrected word
}

function addWord() {
    const wordInput = document.getElementById('input-word');
    const translationInput = document.getElementById('input-translation');
    const wordText = wordInput.value.trim().toLowerCase();
    const translation = translationInput.value.trim();

    if (!wordText || !translation) {
        showNotification('请填写完整信息', 'alert-circle');
        return;
    }

    if (words.some(w => w.text.toLowerCase() === wordText)) {
        showNotification('该单词已添加！', 'alert-triangle');
        return;
    }

    const now = new Date().getTime();
    const newWord = {
        id: Date.now(),
        text: wordText,
        translation: translation,
        createdAt: now,
        familiar: false,
        reviews: EBBINGHAUS_INTERVALS.map(interval => ({
            scheduledAt: now + interval,
            completed: false
        })),
        progress: 0
    };

    words.push(newWord);
    saveUserData();
    
    // Reset form and focus back to first field
    wordInput.value = '';
    translationInput.value = '';
    document.getElementById('spell-suggestion-box').classList.add('hidden'); // Hide suggestions
    wordInput.focus();
    
    showNotification('单词已加入背诵计划！', 'check-circle');
    updateStats();
}

function deleteWord(id) {
    words = words.filter(w => w.id !== id);
    saveUserData();
    renderWordList();
    updateStats();
}

function markAsFamiliar(id) {
    const word = words.find(w => w.id === id);
    if (word) {
        word.familiar = !word.familiar; // Toggle familiar state
        saveUserData();
        renderWordList();
        updateStats();
        showNotification(word.familiar ? '已标记为熟悉' : '已取消熟悉标记', 'check-circle');
    }
}

function openEditModal(id) {
    const word = words.find(w => w.id === id);
    if (!word) return;
    
    editingWordId = id;
    const wordInput = document.getElementById('edit-input-word');
    const translationInput = document.getElementById('edit-input-translation');
    
    wordInput.value = word.text;
    translationInput.value = word.translation;

    // Add Keyboard Listeners for editing
    wordInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            translationInput.focus();
        }
    };
    translationInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        }
    };
    
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.children[0].classList.remove('scale-95');
}

function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.children[0].classList.add('scale-95');
}

function saveEdit() {
    const wordText = document.getElementById('edit-input-word').value.trim();
    const translation = document.getElementById('edit-input-translation').value.trim();
    
    if (!wordText || !translation) {
        showNotification('请填写完整信息', 'alert-circle');
        return;
    }
    
    const wordIndex = words.findIndex(w => w.id === editingWordId);
    if (wordIndex > -1) {
        words[wordIndex].text = wordText;
        words[wordIndex].translation = translation;
        saveUserData();
        renderWordList();
        closeEditModal();
        showNotification('修改已保存', 'check-circle');
    }
}

function updateStats() {
    const now = new Date().getTime();
    // Only count words that are NOT marked as familiar
    const todayCount = words.filter(w => 
        !w.familiar && w.reviews.some(r => !r.completed && r.scheduledAt <= now + 12 * 60 * 60 * 1000)
    ).length;
    
    const counter = document.getElementById('today-count');
    if (counter) counter.innerText = `${todayCount} 单词`;

    updateReminder(now);
}

function updateReminder(now) {
    const reminderContainer = document.getElementById('next-review-reminder');
    const timeText = document.getElementById('next-review-time-text');
    
    if (!reminderContainer || !timeText) return;

    // Find the next upcoming review time across all non-familiar words
    let nextReviewTime = Infinity;
    let isPastDue = false;

    words.forEach(w => {
        if (w.familiar) return;
        w.reviews.forEach(r => {
            if (!r.completed) {
                if (r.scheduledAt <= now) {
                    isPastDue = true;
                }
                if (r.scheduledAt < nextReviewTime) {
                    nextReviewTime = r.scheduledAt;
                }
            }
        });
    });

    if (nextReviewTime === Infinity) {
        reminderContainer.classList.add('hidden');
        return;
    }

    reminderContainer.classList.remove('hidden');
    const df = window.dateFns;
    const nextDate = new Date(nextReviewTime);
    
    if (isPastDue) {
        timeText.innerText = "有单词需要复习啦！";
        timeText.classList.add('text-rose-600');
        timeText.classList.remove('text-amber-800');
    } else {
        const timeStr = df.format(nextDate, 'HH:mm');
        const dayStr = df.isToday(nextDate) ? '今天' : (df.isTomorrow(nextDate) ? '明天' : df.format(nextDate, 'MM-dd'));
        timeText.innerText = `${dayStr} ${timeStr} 要背单词啦`;
        timeText.classList.remove('text-rose-600');
        timeText.classList.add('text-amber-800');
    }
}

// --- Review Logic ---
function startReview() {
    isFreeStudyMode = false;
    const now = new Date().getTime();
    reviewQueue = words.filter(w => 
        !w.familiar && w.reviews.some(r => !r.completed && r.scheduledAt <= now)
    ).map(w => ({
        ...w,
        currentReview: w.reviews.find(r => !r.completed && r.scheduledAt <= now)
    }));

    if (reviewQueue.length === 0) {
        showNotification('暂无需要复习的单词', 'smile');
        return;
    }

    const modal = document.getElementById('review-modal');
    const modeSelection = document.getElementById('mode-selection');
    const quizScreen = document.getElementById('quiz-screen');
    
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modeSelection.classList.remove('hidden', 'scale-95');
    quizScreen.classList.add('hidden');
    
    currentReviewIndex = 0;
}

function selectReviewMode(mode) {
    selectedReviewMode = mode;
    document.getElementById('mode-selection').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    
    if (mode === 'spell') {
        const spellInput = document.getElementById('spell-input');
        spellInput.onkeypress = (e) => {
            if (e.key === 'Enter') checkSpelling();
        };
    }
    
    renderQuestion();
}

function renderQuestion() {
    const word = reviewQueue[currentReviewIndex];
    const questionText = document.getElementById('quiz-question-text');
    const modeTag = document.getElementById('quiz-mode-tag');
    const progress = document.getElementById('quiz-progress');
    const choiceContainer = document.getElementById('choice-container');
    const spellingContainer = document.getElementById('spelling-container');
    const feedbackContainer = document.getElementById('feedback-container');
    
    progress.innerText = `${currentReviewIndex + 1} / ${reviewQueue.length}`;
    feedbackContainer.classList.add('hidden');
    
    if (selectedReviewMode === 'en-zh') {
        modeTag.innerText = '看英文选中文';
        questionText.innerText = word.text;
        showChoices(word, 'translation');
    } else if (selectedReviewMode === 'zh-en') {
        modeTag.innerText = '看中文选英文';
        questionText.innerText = word.translation;
        showChoices(word, 'text');
    } else if (selectedReviewMode === 'spell') {
        modeTag.innerText = '看中文拼写英文';
        questionText.innerText = word.translation;
        choiceContainer.classList.add('hidden');
        spellingContainer.classList.remove('hidden');
        const spellInput = document.getElementById('spell-input');
        spellInput.value = '';
        spellInput.focus();
    }
}

function showChoices(word, type) {
    const choiceContainer = document.getElementById('choice-container');
    const spellingContainer = document.getElementById('spelling-container');
    choiceContainer.classList.remove('hidden');
    spellingContainer.classList.add('hidden');
    
    const others = words.filter(w => w.id !== word.id);
    const distractors = [];
    while (distractors.length < Math.min(3, others.length)) {
        const randomWord = others[Math.floor(Math.random() * others.length)];
        if (!distractors.includes(randomWord)) {
            distractors.push(randomWord);
        }
    }
    
    const allChoices = [...distractors, word].sort(() => Math.random() - 0.5);
    
    choiceContainer.innerHTML = allChoices.map(c => `
        <button onclick="checkAnswer('${c.id}')" class="w-full p-4 text-left border-2 border-slate-100 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 transition-all font-medium text-slate-700">
            ${type === 'text' ? c.text : c.translation}
        </button>
    `).join('');
}

function checkAnswer(selectedId) {
    const word = reviewQueue[currentReviewIndex];
    const isCorrect = selectedId === String(word.id);
    showFeedback(isCorrect);
}

function checkSpelling() {
    const word = reviewQueue[currentReviewIndex];
    const input = document.getElementById('spell-input').value.trim().toLowerCase();
    const isCorrect = input === word.text.toLowerCase();
    showFeedback(isCorrect);
}

function showFeedback(isCorrect) {
    const feedbackContainer = document.getElementById('feedback-container');
    const status = document.getElementById('feedback-status');
    const correctAns = document.getElementById('feedback-correct-answer');
    const word = reviewQueue[currentReviewIndex];
    
    feedbackContainer.classList.remove('hidden');
    document.getElementById('choice-container').classList.add('hidden');
    document.getElementById('spelling-container').classList.add('hidden');
    
    if (isCorrect) {
        status.innerText = '太棒了! 正确';
        status.className = 'text-2xl font-bold text-emerald-500 mb-2';
        correctAns.classList.add('hidden');
        
        if (!isFreeStudyMode) {
            const wordInState = words.find(w => w.id === word.id);
            const review = wordInState.reviews.find(r => r.scheduledAt === word.currentReview.scheduledAt);
            review.completed = true;
            wordInState.progress = (wordInState.reviews.filter(r => r.completed).length / wordInState.reviews.length) * 100;
            saveUserData();
        }
    } else {
        status.innerText = '继续努力! 错误';
        status.className = 'text-2xl font-bold text-rose-500 mb-2';
        correctAns.classList.remove('hidden');
        correctAns.innerHTML = `正确答案: <span class="font-bold text-slate-800">${word.text}</span> <br> <span class="text-sm">${word.translation}</span>`;
    }
    
    updateStats();
}

function nextQuestion() {
    currentReviewIndex++;
    if (currentReviewIndex < reviewQueue.length) {
        renderQuestion();
    } else {
        showNotification('完成本次复习！', 'award');
        closeReview();
        if (currentView === 'list') renderWordList();
        if (currentView === 'calendar') renderCalendar();
    }
}

function closeReview() {
    const modal = document.getElementById('review-modal');
    modal.classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('mode-selection').classList.add('scale-95');
    document.getElementById('quiz-screen').classList.add('scale-95');
}

// --- Study View Logic ---
function renderStudyWord() {
    const wordText = document.getElementById('study-word-text');
    const wordTranslation = document.getElementById('study-word-translation');
    const progress = document.getElementById('study-progress');
    const translationContainer = document.getElementById('study-translation-container');
    const showBtn = document.getElementById('btn-study-show-translation');
    
    if (words.length === 0) {
        wordText.innerText = '暂无单词';
        wordTranslation.innerText = '请先去添加单词吧';
        progress.innerText = '0 / 0';
        translationContainer.classList.remove('hidden');
        showBtn.classList.add('hidden');
        return;
    }
    
    if (studyIndex >= words.length) studyIndex = 0;
    if (studyIndex < 0) studyIndex = words.length - 1;
    
    const word = words[studyIndex];
    wordText.innerText = word.text;
    wordTranslation.innerText = word.translation;
    progress.innerText = `${studyIndex + 1} / ${words.length}`;
    
    translationContainer.classList.add('hidden');
    showBtn.classList.remove('hidden');
}

function toggleStudyTranslation() {
    const container = document.getElementById('study-translation-container');
    const btn = document.getElementById('btn-study-show-translation');
    container.classList.remove('hidden');
    btn.classList.add('hidden');
}

function nextStudyWord() {
    studyIndex++;
    renderStudyWord();
}

function prevStudyWord() {
    studyIndex--;
    renderStudyWord();
}

function setStudyTab(tab) {
    const browseBtn = document.getElementById('tab-browse');
    const quizBtn = document.getElementById('tab-quiz');
    const browseContent = document.getElementById('study-browse-content');
    const quizContent = document.getElementById('study-quiz-content');

    if (tab === 'browse') {
        browseBtn.classList.add('bg-white', 'text-indigo-600', 'shadow-sm');
        browseBtn.classList.remove('text-slate-500');
        quizBtn.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm');
        quizBtn.classList.add('text-slate-500');
        browseContent.classList.remove('hidden');
        quizContent.classList.add('hidden');
        renderStudyWord();
    } else {
        quizBtn.classList.add('bg-white', 'text-indigo-600', 'shadow-sm');
        quizBtn.classList.remove('text-slate-500');
        browseBtn.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm');
        browseBtn.classList.add('text-slate-500');
        quizContent.classList.remove('hidden');
        browseContent.classList.add('hidden');
    }
}

function startFreeQuiz(mode) {
    if (words.length < 2) {
        showNotification('请至少添加2个单词以开始练习', 'alert-circle');
        return;
    }

    isFreeStudyMode = true;
    selectedReviewMode = mode;
    reviewQueue = [...words].sort(() => Math.random() - 0.5).map(w => ({
        ...w,
        currentReview: { scheduledAt: 0 }
    }));

    currentReviewIndex = 0;
    const modal = document.getElementById('review-modal');
    const modeSelection = document.getElementById('mode-selection');
    const quizScreen = document.getElementById('quiz-screen');
    
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modeSelection.classList.add('hidden');
    quizScreen.classList.remove('hidden', 'scale-95');
    
    if (mode === 'spell') {
        const spellInput = document.getElementById('spell-input');
        spellInput.onkeypress = (e) => {
            if (e.key === 'Enter') checkSpelling();
        };
    }
    renderQuestion();
}

// --- List Rendering ---
function renderWordList() {
    const tbody = document.getElementById('word-table-body');
    const searchInput = document.getElementById('search-word');
    const search = searchInput ? searchInput.value.toLowerCase() : '';
    
    const filteredWords = words.filter(w => 
        w.text.toLowerCase().includes(search) || 
        w.translation.toLowerCase().includes(search)
    );

    tbody.innerHTML = filteredWords.map(w => `
        <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${w.familiar ? 'opacity-40 grayscale' : ''}">
            <td class="px-6 py-4 font-bold ${w.familiar ? 'text-slate-400' : 'text-slate-900'}">${w.text}</td>
            <td class="px-6 py-4 ${w.familiar ? 'text-slate-300' : 'text-slate-600'}">${w.translation}</td>
            <td class="px-6 py-4 text-slate-400 text-sm">${new Date(w.createdAt).toLocaleDateString()}</td>
            <td class="px-6 py-4">
                <div class="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div class="bg-indigo-500 h-full" style="width: ${(w.reviews.filter(r => r.completed).length / w.reviews.length) * 100}%"></div>
                </div>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex justify-end items-center gap-2">
                    <button onclick="openEditModal(${w.id})" class="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="编辑">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    <button onclick="markAsFamiliar(${w.id})" class="px-3 py-1 rounded-lg text-xs font-bold transition-all ${w.familiar ? 'bg-slate-200 text-slate-500 hover:bg-slate-300' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'}" title="${w.familiar ? '取消熟悉' : '标记为熟悉'}">
                        ${w.familiar ? '取消熟悉' : '已熟悉'}
                    </button>
                    <button onclick="deleteWord(${w.id})" class="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="删除">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

if (document.getElementById('search-word')) {
    document.getElementById('search-word').addEventListener('input', renderWordList);
}

// --- Calendar Logic ---
function setCalendarMode(mode) {
    calendarMode = mode;
    document.querySelectorAll('.calendar-mode-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('text-slate-600');
    });
    document.getElementById(`mode-${mode}`).classList.add('bg-indigo-600', 'text-white');
    document.getElementById(`mode-${mode}`).classList.remove('text-slate-600');
    renderCalendar();
}

function prevPeriod() {
    const df = window.dateFns;
    if (calendarMode === 'year') calendarDate = df.subYears(calendarDate, 1);
    else if (calendarMode === 'month') calendarDate = df.subMonths(calendarDate, 1);
    else if (calendarMode === 'day') calendarDate = df.subDays(calendarDate, 1);
    renderCalendar();
}

function nextPeriod() {
    const df = window.dateFns;
    if (calendarMode === 'year') calendarDate = df.addYears(calendarDate, 1);
    else if (calendarMode === 'month') calendarDate = df.addMonths(calendarDate, 1);
    else if (calendarMode === 'day') calendarDate = df.addDays(calendarDate, 1);
    renderCalendar();
}

function todayPeriod() {
    calendarDate = new Date();
    renderCalendar();
}

function renderCalendar() {
    const container = document.getElementById('calendar-content');
    const label = document.getElementById('current-period-label');
    const df = window.dateFns;
    
    if (!container || !label) return;
    
    container.innerHTML = '';
    
    if (calendarMode === 'month') {
        label.innerText = df.format(calendarDate, 'yyyy年 MM月');
        renderMonthView(container, calendarDate);
    } else if (calendarMode === 'year') {
        label.innerText = df.format(calendarDate, 'yyyy年');
        renderYearView(container, calendarDate);
    } else if (calendarMode === 'day') {
        label.innerText = df.format(calendarDate, 'yyyy年 MM月 dd日');
        renderDayView(container, calendarDate);
    }
    
    lucide.createIcons();
}

function renderMonthView(container, date) {
    const df = window.dateFns;
    const start = df.startOfMonth(date);
    const end = df.endOfMonth(date);
    const days = df.eachDayOfInterval({ start: df.startOfWeek(start), end: df.endOfWeek(end) });

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-7 gap-2';
    
    ['日', '一', '二', '三', '四', '五', '六'].forEach(d => {
        grid.innerHTML += `<div class="text-center text-xs font-bold text-slate-400 py-2">${d}</div>`;
    });

    days.forEach(day => {
        const isCurrentMonth = df.isSameMonth(day, date);
        const isToday = df.isToday(day);
        const dayWords = words.filter(w => 
            !w.familiar && w.reviews.some(r => df.isSameDay(new Date(r.scheduledAt), day))
        );

        grid.innerHTML += `
            <div onclick="calendarDate = new Date(${day.getTime()}); setCalendarMode('day')" class="min-h-[80px] md:min-h-[100px] p-1 md:p-2 rounded-xl md:rounded-2xl border cursor-pointer hover:border-indigo-200 transition-all ${isCurrentMonth ? 'bg-white border-slate-100' : 'bg-slate-50 border-transparent opacity-40'} ${isToday ? 'ring-2 ring-indigo-500' : ''}">
                <div class="text-xs md:text-sm font-semibold mb-1">${df.format(day, 'd')}</div>
                <div class="space-y-1 overflow-hidden">
                    ${dayWords.slice(0, 2).map(w => `<div class="text-[8px] md:text-[10px] px-1 py-0.5 bg-indigo-50 text-indigo-600 rounded-md truncate">${w.text}</div>`).join('')}
                    ${dayWords.length > 2 ? `<div class="text-[8px] md:text-[10px] text-slate-400 pl-1">+${dayWords.length - 2}</div>` : ''}
                </div>
            </div>
        `;
    });
    container.appendChild(grid);
}

function renderYearView(container, date) {
    const df = window.dateFns;
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-3 md:grid-cols-4 gap-6';

    for (let i = 0; i < 12; i++) {
        const month = df.setMonth(date, i);
        const monthWords = words.filter(w => 
            !w.familiar && w.reviews.some(r => df.isSameMonth(new Date(r.scheduledAt), month) && df.isSameYear(new Date(r.scheduledAt), month))
        );

        grid.innerHTML += `
            <button onclick="calendarDate = new Date(${month.getTime()}); setCalendarMode('month')" class="p-6 rounded-3xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left">
                <div class="text-lg font-bold text-slate-800 mb-1">${i + 1}月</div>
                <div class="text-sm text-slate-500">${monthWords.length} 个复习任务</div>
            </button>
        `;
    }
    container.appendChild(grid);
}

function renderDayView(container, date) {
    const df = window.dateFns;
    const dayWords = words.flatMap(w => 
        w.familiar ? [] : w.reviews
            .filter(r => df.isSameDay(new Date(r.scheduledAt), date))
            .map(r => ({ ...w, scheduledAt: r.scheduledAt, completed: r.completed }))
    ).sort((a, b) => a.scheduledAt - b.scheduledAt);

    if (dayWords.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 text-slate-400">
                <i data-lucide="calendar-x" class="w-12 h-12 mb-4 opacity-20"></i>
                <p>该日没有复习任务</p>
                <button onclick="setCalendarMode('month')" class="mt-4 text-indigo-600 font-medium hover:underline">返回月视图</button>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = `
        <div class="space-y-4">
            ${dayWords.map(w => `
                <div class="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow">
                    <div class="text-sm font-mono text-slate-400">${df.format(new Date(w.scheduledAt), 'HH:mm')}</div>
                    <div class="flex-1">
                        <div class="font-bold text-slate-800">${w.text}</div>
                        <div class="text-sm text-slate-500">${w.translation}</div>
                    </div>
                    <div class="px-3 py-1 rounded-full text-xs font-bold ${w.completed ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}">
                        ${w.completed ? '已完成' : '待复习'}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// --- UI Helpers ---
function showNotification(msg, icon = 'info') {
    const notif = document.getElementById('notification');
    const msgEl = document.getElementById('notif-message');
    const iconEl = document.getElementById('notif-icon');
    
    if (!notif || !msgEl || !iconEl) return;
    
    msgEl.innerText = msg;
    iconEl.setAttribute('data-lucide', icon);
    lucide.createIcons();
    
    notif.classList.remove('translate-y-20', 'opacity-0');
    
    setTimeout(() => {
        notif.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

// Check for existing session on load
window.onload = () => {
    const savedUser = localStorage.getItem('current_user_session');
    if (savedUser) {
        document.getElementById('auth-username').value = savedUser;
        handleLogin();
    }
    
    // Add Keyboard Listeners for adding words
    const wordInput = document.getElementById('input-word');
    const translationInput = document.getElementById('input-translation');

    if (wordInput && translationInput) {
        wordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                translateWord();
                // translateWord internally calls updateExternalLinks and focus()
            }
        });

        translationInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addWord();
            }
        });
    }

    // Start periodic update for reminder
    setInterval(() => {
        if (currentUser) updateStats();
    }, 60000);

    // Global Review Keyboard Listener
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const feedbackContainer = document.getElementById('feedback-container');
            if (feedbackContainer && !feedbackContainer.classList.contains('hidden')) {
                nextQuestion();
            }
        }
    });
};
