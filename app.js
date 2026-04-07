// ================================================================
//  VaultGuard — Frontend Application Logic
// ================================================================

const API = '';

// ── DOM References ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

// Screens
const loginScreen     = $('login-screen');
const dashboardScreen = $('dashboard-screen');

// Login
const loginForm       = $('login-form');
const masterPwInput   = $('master-password');
const confirmPwInput  = $('confirm-password');
const confirmGroup    = $('confirm-group');
const loginBtn        = $('login-btn');
const loginError      = $('login-error');
const loginSubtitle   = $('login-subtitle');
const toggleMasterPw  = $('toggle-master-pw');

// Dashboard
const sidebar         = $('sidebar');
const hamburger       = $('hamburger');
const navCredentials  = $('nav-credentials');
const navGenerator    = $('nav-generator');
const navAudit        = $('nav-audit');
const viewCredentials = $('view-credentials');
const viewGenerator   = $('view-generator');
const viewAudit       = $('view-audit');
const credentialsList = $('credentials-list');
const auditList       = $('audit-list');
const auditEmptyState = $('audit-empty-state');
const auditSubtitle   = $('audit-subtitle');
const credentialCount = $('credential-count');
const emptyState      = $('empty-state');
const searchInput     = $('search-input');

// Add modal
const modalOverlay    = $('modal-overlay');
const addForm         = $('add-form');
const addSite         = $('add-site');
const addUsername     = $('add-username');
const addPassword     = $('add-password');
const toggleAddPw     = $('toggle-add-pw');
const btnAddCred      = $('btn-add-credential');
const btnCancelAdd    = $('btn-cancel-add');
const modalClose      = $('modal-close');
const btnGenForAdd    = $('btn-gen-for-add');

// Delete modal
const deleteOverlay   = $('delete-overlay');
const deleteSiteName  = $('delete-site-name');
const btnCancelDelete = $('btn-cancel-delete');
const btnConfirmDel   = $('btn-confirm-delete');
const deleteClose     = $('delete-close');

// Generator
const genPassword     = $('generated-password');
const genLength       = $('gen-length');
const genLengthVal    = $('gen-length-val');
const genUpper        = $('gen-upper');
const genDigits       = $('gen-digits');
const genSymbols      = $('gen-symbols');
const strengthBar     = $('strength-bar');
const strengthLabel   = $('strength-label');
const btnGenerate     = $('btn-generate');
const btnCopyGen      = $('btn-copy-generated');
const btnRegenerate   = $('btn-regenerate');

// Vault actions
const btnSaveVault    = $('btn-save-vault');
const btnLockVault    = $('btn-lock-vault');

// Toast
const toastContainer  = $('toast-container');

// ── State ───────────────────────────────────────────────────────
let credentials = [];
let pendingDeleteSite = null;
let isNewVault = false;
let autoSaveInterval = null;

// ── Initialize ──────────────────────────────────────────────────
async function init() {
    try {
        const res = await fetch(`${API}/api/status`);
        const data = await res.json();
        if (data.unlocked) {
            showDashboard();
            loadCredentials();
        } else {
            isNewVault = !data.vaultExists;
            if (isNewVault) {
                loginSubtitle.textContent = 'Create a master password for your new vault';
                confirmGroup.classList.remove('hidden');
                loginBtn.querySelector('.btn-text').textContent = 'Create Vault';
            }
        }
    } catch (e) {
        showToast('Cannot connect to server', 'error');
    }
}

// ── Authentication ──────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const password = masterPwInput.value;
    if (!password) return;

    if (isNewVault) {
        const confirm = confirmPwInput.value;
        if (password !== confirm) {
            showError('Passwords do not match');
            return;
        }
    }

    setLoading(true);

    try {
        const res = await fetch(`${API}/api/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ masterPassword: password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            showDashboard();
            loadCredentials();
            if (data.isNew) showToast('Vault created successfully!', 'success');
            else showToast(`Vault unlocked (${data.entries} entries)`, 'success');
            startAutoSave();
        } else {
            showError(data.error || 'Authentication failed');
        }
    } catch (e) {
        showError('Cannot connect to server');
    } finally {
        setLoading(false);
    }
});

// ── Toggle Password Visibility ──────────────────────────────────
function setupToggle(btn, input) {
    btn.addEventListener('click', () => {
        const t = input.type === 'password' ? 'text' : 'password';
        input.type = t;
        btn.innerHTML = t === 'password' 
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    });
}
setupToggle(toggleMasterPw, masterPwInput);
setupToggle(toggleAddPw, addPassword);

// ── Screen Navigation ───────────────────────────────────────────
function showDashboard() {
    loginScreen.classList.remove('active');
    dashboardScreen.classList.add('active');
}

function showLogin() {
    dashboardScreen.classList.remove('active');
    loginScreen.classList.add('active');
    masterPwInput.value = '';
    confirmPwInput.value = '';
}

// ── View Navigation ─────────────────────────────────────────────
function switchView(viewName) {
    document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    if (viewName === 'credentials') {
        navCredentials.classList.add('active');
        viewCredentials.classList.add('active');
    } else if (viewName === 'generator') {
        navGenerator.classList.add('active');
        viewGenerator.classList.add('active');
    } else if (viewName === 'audit') {
        navAudit.classList.add('active');
        viewAudit.classList.add('active');
        runAudit();
    }

    // Close mobile sidebar
    sidebar.classList.remove('open');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.classList.remove('active');
}

navCredentials.addEventListener('click', () => switchView('credentials'));
navGenerator.addEventListener('click', () => switchView('generator'));
navAudit.addEventListener('click', () => switchView('audit'));

// ── Mobile Sidebar ──────────────────────────────────────────────
hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }
    overlay.classList.toggle('active');
});

// ── Credentials CRUD ────────────────────────────────────────────
async function loadCredentials(search = '') {
    try {
        const url = search 
            ? `${API}/api/credentials?search=${encodeURIComponent(search)}`
            : `${API}/api/credentials`;
        const res = await fetch(url);
        credentials = await res.json();
        renderCredentials();
    } catch (e) {
        showToast('Failed to load credentials', 'error');
    }
}

function renderCredentials() {
    credentialsList.innerHTML = '';
    credentialCount.textContent = `${credentials.length} ${credentials.length === 1 ? 'entry' : 'entries'} stored`;

    if (credentials.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    credentials.forEach((cred, index) => {
        const card = document.createElement('div');
        card.className = 'credential-card';
        card.style.animationDelay = `${index * 0.05}s`;

        const initial = cred.site.charAt(0).toUpperCase();
        const maskedPw = '•'.repeat(Math.min(cred.password.length, 16));

        card.innerHTML = `
            <div class="card-header">
                <div class="card-site">
                    <div class="site-icon">${initial}</div>
                    <span class="site-name">${escapeHtml(cred.site)}</span>
                </div>
                <div class="card-actions">
                    <button class="card-action-btn edit" title="Edit" data-site="${escapeHtml(cred.site)}" data-username="${escapeHtml(cred.username)}" data-password="${escapeHtml(cred.password)}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="card-action-btn delete" title="Delete" data-site="${escapeHtml(cred.site)}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
            <div class="card-field">
                <div>
                    <div class="field-label">Username</div>
                    <div class="field-value">${escapeHtml(cred.username)}</div>
                </div>
                <div class="field-actions">
                    <button class="field-btn copy-btn" title="Copy username" data-copy="${escapeHtml(cred.username)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                </div>
            </div>
            <div class="card-field">
                <div>
                    <div class="field-label">Password</div>
                    <div class="field-value password-masked" data-real="${escapeHtml(cred.password)}">${maskedPw}</div>
                </div>
                <div class="field-actions">
                    <button class="field-btn toggle-pw-btn" title="Show password">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="field-btn copy-btn" title="Copy password" data-copy="${escapeHtml(cred.password)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                </div>
            </div>
        `;

        credentialsList.appendChild(card);
    });

    // Attach event listeners
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            copyToClipboard(btn.dataset.copy);
        });
    });

    document.querySelectorAll('.toggle-pw-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const field = btn.closest('.card-field').querySelector('.password-masked');
            const real = field.dataset.real;
            if (field.textContent === real) {
                field.textContent = '•'.repeat(Math.min(real.length, 16));
            } else {
                field.textContent = real;
            }
        });
    });

    document.querySelectorAll('.card-action-btn.edit').forEach(btn => {
        btn.addEventListener('click', () => {
            $('modal-title').textContent = 'Update Credential';
            addSite.value = btn.dataset.site;
            addSite.readOnly = true;
            addUsername.value = btn.dataset.username;
            addPassword.value = btn.dataset.password;
            addPassword.type = 'password';
            modalOverlay.classList.remove('hidden');
        });
    });

    document.querySelectorAll('.card-action-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => {
            pendingDeleteSite = btn.dataset.site;
            deleteSiteName.textContent = btn.dataset.site;
            deleteOverlay.classList.remove('hidden');
        });
    });
}

// ── Search ──────────────────────────────────────────────────────
let searchTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadCredentials(searchInput.value.trim());
    }, 300);
});

// ── Add Credential ──────────────────────────────────────────────
btnAddCred.addEventListener('click', () => {
    $('modal-title').textContent = 'Add Credential';
    addForm.reset();
    addSite.readOnly = false;
    modalOverlay.classList.remove('hidden');
    addSite.focus();
});

modalClose.addEventListener('click', closeAddModal);
btnCancelAdd.addEventListener('click', closeAddModal);
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeAddModal();
});

function closeAddModal() {
    modalOverlay.classList.add('hidden');
    addForm.reset();
    addSite.readOnly = false;
}

addForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const site = addSite.value.trim();
    const username = addUsername.value.trim();
    const password = addPassword.value;

    if (!site) return;

    try {
        const res = await fetch(`${API}/api/credentials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ site, username, password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            showToast('Credential saved!', 'success');
            closeAddModal();
            loadCredentials();
        } else {
            showToast(data.error || 'Failed to save', 'error');
        }
    } catch (e) {
        showToast('Failed to save credential', 'error');
    }
});

// Generate password for add form
btnGenForAdd.addEventListener('click', async () => {
    try {
        const res = await fetch(`${API}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ length: 20, uppercase: true, digits: true, symbols: true })
        });
        const data = await res.json();
        if (data.password) {
            addPassword.value = data.password;
            addPassword.type = 'text';
            showToast('Password generated!', 'info');
        }
    } catch (e) {
        showToast('Failed to generate password', 'error');
    }
});

// ── Delete Credential ───────────────────────────────────────────
btnConfirmDel.addEventListener('click', async () => {
    if (!pendingDeleteSite) return;

    try {
        const res = await fetch(`${API}/api/credentials?site=${encodeURIComponent(pendingDeleteSite)}`, {
            method: 'DELETE'
        });
        const data = await res.json();

        if (res.ok && data.success) {
            showToast('Credential deleted', 'success');
            deleteOverlay.classList.add('hidden');
            pendingDeleteSite = null;
            loadCredentials();
        } else {
            showToast(data.error || 'Failed to delete', 'error');
        }
    } catch (e) {
        showToast('Failed to delete credential', 'error');
    }
});

btnCancelDelete.addEventListener('click', () => {
    deleteOverlay.classList.add('hidden');
    pendingDeleteSite = null;
});
deleteClose.addEventListener('click', () => {
    deleteOverlay.classList.add('hidden');
    pendingDeleteSite = null;
});
deleteOverlay.addEventListener('click', (e) => {
    if (e.target === deleteOverlay) {
        deleteOverlay.classList.add('hidden');
        pendingDeleteSite = null;
    }
});

// ── Password Generator ─────────────────────────────────────────
genLength.addEventListener('input', () => {
    genLengthVal.textContent = genLength.value;
});

async function generatePassword() {
    try {
        const res = await fetch(`${API}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                length: parseInt(genLength.value),
                uppercase: genUpper.checked,
                digits: genDigits.checked,
                symbols: genSymbols.checked
            })
        });
        const data = await res.json();
        if (data.password) {
            genPassword.value = data.password;
            updateStrength(data.password);
        }
    } catch (e) {
        showToast('Failed to generate password', 'error');
    }
}

btnGenerate.addEventListener('click', generatePassword);
btnRegenerate.addEventListener('click', generatePassword);

btnCopyGen.addEventListener('click', () => {
    if (genPassword.value) copyToClipboard(genPassword.value);
});

function updateStrength(password) {
    let score = 0;
    if (password.length >= 8)  score++;
    if (password.length >= 12) score++;
    if (password.length >= 20) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const levels = [
        { label: 'Very Weak', color: '#ef4444', width: 15 },
        { label: 'Weak',      color: '#f97316', width: 30 },
        { label: 'Fair',      color: '#f59e0b', width: 45 },
        { label: 'Good',      color: '#84cc16', width: 60 },
        { label: 'Strong',    color: '#22c55e', width: 80 },
        { label: 'Very Strong', color: '#10b981', width: 100 }
    ];

    const level = levels[Math.min(score, levels.length - 1)];
    strengthBar.style.width = level.width + '%';
    strengthBar.style.background = level.color;
    strengthLabel.textContent = level.label;
    strengthLabel.style.color = level.color;
}

// ── Vault Actions ───────────────────────────────────────────────
btnSaveVault.addEventListener('click', () => autoSaveNow(true));

// ── Auto-Save ───────────────────────────────────────────────────
function startAutoSave() {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = setInterval(() => autoSaveNow(false), 30000); // every 30s
}

async function autoSaveNow(manual = false) {
    try {
        const res = await fetch(`${API}/api/save`, { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.success) {
            // Update button text briefly to show auto-saved status
            const label = btnSaveVault.querySelector('span');
            label.textContent = 'Auto-saved ✓';
            setTimeout(() => { label.textContent = 'Save Vault'; }, 2000);
            if (manual) showToast('Vault saved!', 'success');
        } else if (manual) {
            showToast(data.error || 'Failed to save', 'error');
        }
    } catch (e) {
        if (manual) showToast('Failed to save vault', 'error');
    }
}

btnLockVault.addEventListener('click', async () => {
    try {
        await fetch(`${API}/api/logout`, { method: 'POST' });
    } catch (e) { /* ignore */ }
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    window.location.reload();
});

// ── Utility Functions ───────────────────────────────────────────
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'info');
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Copied to clipboard!', 'info');
    });
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
}

function hideError() {
    loginError.classList.add('hidden');
}

function setLoading(loading) {
    const text = loginBtn.querySelector('.btn-text');
    const loader = loginBtn.querySelector('.btn-loader');

    if (loading) {
        text.classList.add('hidden');
        loader.classList.remove('hidden');
        loginBtn.disabled = true;
    } else {
        text.classList.remove('hidden');
        loader.classList.add('hidden');
        loginBtn.disabled = false;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ── Keyboard Shortcuts ──────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!modalOverlay.classList.contains('hidden')) closeAddModal();
        if (!deleteOverlay.classList.contains('hidden')) {
            deleteOverlay.classList.add('hidden');
            pendingDeleteSite = null;
        }
    }
});

// ── Security Audit ──────────────────────────────────────────────
function getStrengthScore(password) {
    let score = 0;
    if (password.length >= 8)  score++;
    if (password.length >= 12) score++;
    if (password.length >= 20) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
}

function runAudit() {
    auditList.innerHTML = '';
    
    // Passwords are considered weak if score < 4
    const weakCredentials = credentials.filter(c => getStrengthScore(c.password) < 4);
    
    auditSubtitle.textContent = `Found ${weakCredentials.length} weak password${weakCredentials.length === 1 ? '' : 's'}`;
    
    if (weakCredentials.length === 0) {
        auditEmptyState.classList.remove('hidden');
        return;
    }
    
    auditEmptyState.classList.add('hidden');
    
    weakCredentials.forEach((cred, index) => {
        const card = document.createElement('div');
        card.className = 'credential-card';
        card.style.animationDelay = `${index * 0.05}s`;
        
        // Add a red border highlight
        card.style.borderColor = 'rgba(239, 68, 68, 0.4)';

        const initial = cred.site.charAt(0).toUpperCase();
        const maskedPw = '•'.repeat(Math.min(cred.password.length, 16));

        card.innerHTML = `
            <div class="card-header">
                <div class="card-site">
                    <div class="site-icon" style="color: #ef4444; background: rgba(239, 68, 68, 0.1);">${initial}</div>
                    <span class="site-name">${escapeHtml(cred.site)}</span>
                </div>
                <div class="card-actions">
                    <button class="card-action-btn edit" title="Update Password" data-site="${escapeHtml(cred.site)}" data-username="${escapeHtml(cred.username)}" data-password="${escapeHtml(cred.password)}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                </div>
            </div>
            <div class="card-field">
                <div>
                    <div class="field-label">Username</div>
                    <div class="field-value">${escapeHtml(cred.username)}</div>
                </div>
            </div>
            <div class="card-field">
                <div>
                    <div class="field-label">Password</div>
                    <div class="field-value password-masked" data-real="${escapeHtml(cred.password)}">${maskedPw}</div>
                </div>
                <div class="field-actions">
                    <button class="field-btn toggle-pw-btn" title="Show password">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <span style="color: #ef4444; font-size: 0.75rem; font-weight: bold; margin-left: 8px; display: flex; align-items: center;">WEAK</span>
                </div>
            </div>
        `;
        auditList.appendChild(card);
    });

    // Attach event listeners for audit cards
    auditList.querySelectorAll('.toggle-pw-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const field = btn.closest('.card-field').querySelector('.password-masked');
            const real = field.dataset.real;
            if (field.textContent === real) {
                field.textContent = '•'.repeat(Math.min(real.length, 16));
            } else {
                field.textContent = real;
            }
        });
    });

    auditList.querySelectorAll('.card-action-btn.edit').forEach(btn => {
        btn.addEventListener('click', () => {
            $('modal-title').textContent = 'Update Weak Password';
            addSite.value = btn.dataset.site;
            addSite.readOnly = true;
            addUsername.value = btn.dataset.username;
            addPassword.value = '';
            modalOverlay.classList.remove('hidden');
        });
    });
}

// ── Start ───────────────────────────────────────────────────────
init();
