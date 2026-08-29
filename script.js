/**
 * Tekki Bio Page • Master Script
 * Features: Lanyard WebSocket + REST fallback, Live Spotify progress,
 * Multiple Discord activities switcher & carousel, 3D card tilt & Toast.
 */

const CONFIG = {
    DISCORD_USER_ID: '906205804468777011',
    WS_URL: 'wss://api.lanyard.rest/socket',
    REST_URL: 'https://api.lanyard.rest/v1/users/906205804468777011',
    RECONNECT_DELAY: 5000,
    FALLBACK_POLL_INTERVAL: 15000
};

// Application State
const state = {
    ws: null,
    heartbeatInterval: null,
    fallbackTimer: null,
    spotifyTimer: null,
    gameTimer: null,
    currentPresence: null,
    spotifyData: null,
    gameStartTime: null,
    activitiesList: [],
    currentActivityIndex: 0
};

// DOM Elements
const elements = {
    currentYear: document.getElementById('currentYear'),
    discordAvatar: document.getElementById('discordAvatar'),
    avatarDecoration: document.getElementById('avatarDecoration'),
    presenceBadge: document.getElementById('presenceBadge'),
    displayName: document.getElementById('displayName'),
    discordUsernameText: document.getElementById('discordUsernameText'),
    guildTagBadge: document.getElementById('guildTagBadge'),
    customStatusPill: document.getElementById('customStatusPill'),
    customStatusEmoji: document.getElementById('customStatusEmoji'),
    customStatusText: document.getElementById('customStatusText'),
    
    // Multiple Activities Switcher Controls
    activityHeaderBar: document.getElementById('activityHeaderBar'),
    activityCountBadge: document.getElementById('activityCountBadge'),
    activityDots: document.getElementById('activityDots'),
    prevActivityBtn: document.getElementById('prevActivityBtn'),
    nextActivityBtn: document.getElementById('nextActivityBtn'),

    // Activity Containers
    spotifyCard: document.getElementById('spotifyCard'),
    spotifyAlbumArt: document.getElementById('spotifyAlbumArt'),
    spotifyTrackLink: document.getElementById('spotifyTrackLink'),
    spotifyArtist: document.getElementById('spotifyArtist'),
    spotifyAlbum: document.getElementById('spotifyAlbum'),
    spotifyProgressFill: document.getElementById('spotifyProgressFill'),
    spotifyCurrentTime: document.getElementById('spotifyCurrentTime'),
    spotifyTotalTime: document.getElementById('spotifyTotalTime'),

    gameCard: document.getElementById('gameCard'),
    gameTypeLabel: document.getElementById('gameTypeLabel'),
    gameTimer: document.getElementById('gameTimer'),
    gameLargeImage: document.getElementById('gameLargeImage'),
    gameSmallImage: document.getElementById('gameSmallImage'),
    gameName: document.getElementById('gameName'),
    gameDetails: document.getElementById('gameDetails'),
    gameState: document.getElementById('gameState'),

    genericActivityCard: document.getElementById('genericActivityCard'),
    genericActivityIcon: document.getElementById('genericActivityIcon'),
    genericActivityTitle: document.getElementById('genericActivityTitle'),
    genericActivityDesc: document.getElementById('genericActivityDesc'),

    idleCard: document.getElementById('idleCard'),
    idleTitle: document.getElementById('idleTitle'),
    idleSubtitle: document.getElementById('idleSubtitle'),

    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    mouseSpotlight: document.getElementById('mouseSpotlight')
};

// ==========================================================================
// 1. Year Initialization
// ==========================================================================
function initYear() {
    if (elements.currentYear) {
        elements.currentYear.textContent = new Date().getFullYear();
    }
}

// ==========================================================================
// 2. Lanyard Real-Time Connection (WebSocket + Fallback)
// ==========================================================================
function initLanyard() {
    connectWebSocket();
}

function connectWebSocket() {
    try {
        if (state.ws) {
            state.ws.close();
        }

        state.ws = new WebSocket(CONFIG.WS_URL);

        state.ws.onopen = () => {
            // Wait for Opcode 1 (Hello) before sending Opcode 2 (Initialize)
        };

        state.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                const { op, d, t } = message;

                // Opcode 1: Hello -> start heartbeat & send initialize
                if (op === 1) {
                    const heartbeatInterval = d.heartbeat_interval;
                    startHeartbeat(heartbeatInterval);

                    // Subscribe to user presence
                    state.ws.send(JSON.stringify({
                        op: 2,
                        d: {
                            subscribe_to_id: CONFIG.DISCORD_USER_ID
                        }
                    }));
                }

                // Opcode 0: Dispatch event (INIT_STATE or PRESENCE_UPDATE)
                if (op === 0) {
                    if (t === 'INIT_STATE' || t === 'PRESENCE_UPDATE') {
                        handlePresenceData(d);
                    }
                }
            } catch (err) {
                console.error('Error parsing Lanyard message:', err);
            }
        };

        state.ws.onclose = () => {
            stopHeartbeat();
            scheduleReconnect();
            fetchRestFallback();
        };

        state.ws.onerror = (error) => {
            console.warn('Lanyard WebSocket error, falling back to REST:', error);
            state.ws.close();
        };
    } catch (e) {
        console.error('WebSocket connection failure:', e);
        fetchRestFallback();
    }
}

function startHeartbeat(interval) {
    stopHeartbeat();
    state.heartbeatInterval = setInterval(() => {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ op: 3 }));
        }
    }, interval);
}

function stopHeartbeat() {
    if (state.heartbeatInterval) {
        clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = null;
    }
}

function scheduleReconnect() {
    setTimeout(() => {
        connectWebSocket();
    }, CONFIG.RECONNECT_DELAY);
}

// REST Fallback in case WebSocket is unavailable
async function fetchRestFallback() {
    try {
        const res = await fetch(CONFIG.REST_URL);
        const json = await res.json();
        if (json.success && json.data) {
            handlePresenceData(json.data);
        }
    } catch (err) {
        console.error('Error fetching Lanyard REST:', err);
    }
}

// ==========================================================================
// 3. Process Presence & Update UI
// ==========================================================================
function handlePresenceData(data) {
    state.currentPresence = data;
    const { discord_user, discord_status, activities, spotify } = data;

    // 1. Update Avatar & Decoration
    if (discord_user) {
        const { id, avatar, avatar_decoration_data, global_name, username, primary_guild } = discord_user;

        // Display Name & Username
        if (elements.displayName) {
            elements.displayName.textContent = global_name || username || 'Tekki';
        }
        if (elements.discordUsernameText) {
            elements.discordUsernameText.textContent = `@${username || 'tekki2137'}`;
        }

        // Guild Tag & Clan Fire Badge from Discord API
        if (elements.guildTagBadge) {
            if (primary_guild && primary_guild.tag) {
                let badgeImg = '';
                if (primary_guild.badge && primary_guild.identity_guild_id) {
                    badgeImg = `<img src="https://cdn.discordapp.com/clan-badges/${primary_guild.identity_guild_id}/${primary_guild.badge}.png" alt="Clan Badge" class="guild-badge-icon">`;
                }
                elements.guildTagBadge.innerHTML = `${badgeImg} <span>${primary_guild.tag}</span>`;
                elements.guildTagBadge.classList.remove('hidden');
            } else {
                elements.guildTagBadge.classList.add('hidden');
            }
        }

        // Avatar Image
        if (avatar) {
            const isAnimated = avatar.startsWith('a_');
            const avatarUrl = `https://cdn.discordapp.com/avatars/${id}/${avatar}.${isAnimated ? 'gif' : 'png'}?size=256`;
            elements.discordAvatar.src = avatarUrl;
        }

        // Avatar Decoration
        if (avatar_decoration_data && avatar_decoration_data.asset) {
            elements.avatarDecoration.src = `https://cdn.discordapp.com/avatar-decoration-presets/${avatar_decoration_data.asset}.png`;
            elements.avatarDecoration.classList.remove('hidden');
        } else {
            elements.avatarDecoration.classList.add('hidden');
        }
    }

    // 2. Presence Status Badge (online, idle, dnd, offline)
    if (elements.presenceBadge) {
        elements.presenceBadge.className = 'presence-badge';
        const status = discord_status || 'offline';
        elements.presenceBadge.classList.add(status);
        elements.presenceBadge.title = `Status Discord: ${status.toUpperCase()}`;
    }

    // 3. Custom Status (Forza Ferrari / emoji)
    let customStatus = null;
    if (activities && activities.length > 0) {
        customStatus = activities.find(a => a.type === 4);
    }

    if (customStatus && (customStatus.state || customStatus.emoji)) {
        elements.customStatusPill.classList.remove('hidden');
        if (customStatus.emoji) {
            if (customStatus.emoji.id) {
                const ext = customStatus.emoji.animated ? 'gif' : 'png';
                elements.customStatusEmoji.innerHTML = `<img src="https://cdn.discordapp.com/emojis/${customStatus.emoji.id}.${ext}" alt="Emoji" style="width:16px;height:16px;vertical-align:middle;">`;
            } else {
                elements.customStatusEmoji.textContent = customStatus.emoji.name || '🏎️';
            }
        } else {
            elements.customStatusEmoji.textContent = '🏎️';
        }
        elements.customStatusText.textContent = customStatus.state || '';
    } else {
        elements.customStatusPill.classList.add('hidden');
    }

    // 4. Multiple Activities Routing
    renderActivities(spotify, activities, discord_status);
}

// ==========================================================================
// 4. Multiple Activities Handling (Carousel & Switcher)
// ==========================================================================
function collectActivities(spotify, activities) {
    const list = [];
    
    // 1. Spotify
    if (spotify) {
        list.push({
            kind: 'spotify',
            data: spotify
        });
    }

    // 2. Discord Activities (exclude custom status type 4, and exclude duplicate Spotify activity if spotify object exists)
    if (activities && activities.length > 0) {
        activities.forEach(act => {
            if (act.type === 4) return; // Custom status (type 4) is shown in pill
            if (spotify && act.name === 'Spotify') return; // Already handled by rich spotify player
            list.push({
                kind: 'discord_activity',
                data: act
            });
        });
    }

    return list;
}

function renderActivities(spotify, activities, discord_status) {
    state.activitiesList = collectActivities(spotify, activities);

    // Keep index within bounds
    if (state.currentActivityIndex >= state.activitiesList.length) {
        state.currentActivityIndex = 0;
    }

    // Update Pagination Header (if more than 1 activity)
    if (state.activitiesList.length > 1) {
        if (elements.activityHeaderBar) {
            elements.activityHeaderBar.classList.remove('hidden');
        }
        if (elements.activityCountBadge) {
            elements.activityCountBadge.textContent = `AKTYWNOŚĆ ${state.currentActivityIndex + 1} Z ${state.activitiesList.length}`;
        }
        if (elements.activityDots) {
            elements.activityDots.innerHTML = '';
            for (let i = 0; i < state.activitiesList.length; i++) {
                const dot = document.createElement('span');
                dot.className = `activity-dot ${i === state.currentActivityIndex ? 'active' : ''}`;
                dot.onclick = () => goToActivity(i);
                dot.title = `Przejdź do aktywności ${i + 1}`;
                elements.activityDots.appendChild(dot);
            }
        }
    } else {
        if (elements.activityHeaderBar) {
            elements.activityHeaderBar.classList.add('hidden');
        }
    }

    // If no activities, show Idle/Offline card
    if (state.activitiesList.length === 0) {
        hideAllActivityCards();
        elements.idleCard.classList.remove('hidden');
        if (discord_status === 'offline') {
            elements.idleTitle.textContent = 'Status: Offline';
            elements.idleSubtitle.textContent = 'Obecnie niedostępny';
        } else {
            elements.idleTitle.textContent = 'Brak aktywnej sesji';
            elements.idleSubtitle.textContent = 'Przeglądanie / Chill';
        }
        return;
    }

    // Render the currently selected activity item
    renderCurrentActivity();
}

function hideAllActivityCards() {
    elements.spotifyCard.classList.add('hidden');
    elements.gameCard.classList.add('hidden');
    elements.genericActivityCard.classList.add('hidden');
    elements.idleCard.classList.add('hidden');

    if (state.spotifyTimer) {
        clearInterval(state.spotifyTimer);
        state.spotifyTimer = null;
    }
    if (state.gameTimer) {
        clearInterval(state.gameTimer);
        state.gameTimer = null;
    }
}

function renderCurrentActivity() {
    hideAllActivityCards();
    const item = state.activitiesList[state.currentActivityIndex];
    if (!item) return;

    if (elements.activityCountBadge) {
        elements.activityCountBadge.textContent = `AKTYWNOŚĆ ${state.currentActivityIndex + 1} Z ${state.activitiesList.length}`;
    }

    // Update dots active class
    if (elements.activityDots) {
        const dots = elements.activityDots.querySelectorAll('.activity-dot');
        dots.forEach((dot, idx) => {
            if (idx === state.currentActivityIndex) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }

    if (item.kind === 'spotify') {
        renderSpotifyCard(item.data);
    } else if (item.kind === 'discord_activity') {
        renderDiscordActivityCard(item.data);
    }
}

function renderSpotifyCard(spotify) {
    state.spotifyData = spotify;
    elements.spotifyCard.classList.remove('hidden');
    
    elements.spotifyAlbumArt.src = spotify.album_art_url || '';
    elements.spotifyTrackLink.textContent = spotify.song || 'Nieznany utwór';
    elements.spotifyTrackLink.href = spotify.track_id ? `https://open.spotify.com/track/${spotify.track_id}` : '#';
    elements.spotifyArtist.textContent = spotify.artist || 'Nieznany wykonawca';
    elements.spotifyAlbum.textContent = spotify.album || '';

    updateSpotifyProgress();
    state.spotifyTimer = setInterval(updateSpotifyProgress, 300);
}

function renderDiscordActivityCard(act) {
    elements.gameCard.classList.remove('hidden');

    // Format type label
    let typeLabel = 'GRA W GRĘ';
    if (act.type === 1) typeLabel = 'STREAMUJE';
    else if (act.type === 2) typeLabel = 'SŁUCHA';
    else if (act.type === 3) typeLabel = 'OGLĄDA';
    else if (act.type === 5) typeLabel = 'RYWALIZUJE';
    else if (act.name && act.name.toLowerCase().includes('premid')) typeLabel = 'AKTYWNOŚĆ';
    
    elements.gameTypeLabel.textContent = typeLabel;
    elements.gameName.textContent = act.name || 'Aktywność';
    elements.gameDetails.textContent = act.details || '';
    elements.gameState.textContent = act.state || '';

    // Large & Small Assets
    if (act.assets && act.assets.large_image) {
        let largeUrl = act.assets.large_image;
        if (largeUrl.startsWith('mp:external/')) {
            largeUrl = `https://media.discordapp.net/${largeUrl.replace('mp:', '')}`;
        } else if (!largeUrl.startsWith('http')) {
            largeUrl = `https://cdn.discordapp.com/app-assets/${act.application_id}/${largeUrl}.png`;
        }
        elements.gameLargeImage.src = largeUrl;
        elements.gameLargeImage.classList.remove('hidden');
    } else {
        elements.gameLargeImage.src = 'https://discord.com/assets/game-controller.svg';
    }

    if (act.assets && act.assets.small_image) {
        let smallUrl = act.assets.small_image;
        if (smallUrl.startsWith('mp:external/')) {
            smallUrl = `https://media.discordapp.net/${smallUrl.replace('mp:', '')}`;
        } else if (!smallUrl.startsWith('http')) {
            smallUrl = `https://cdn.discordapp.com/app-assets/${act.application_id}/${smallUrl}.png`;
        }
        elements.gameSmallImage.src = smallUrl;
        elements.gameSmallImage.classList.remove('hidden');
    } else {
        elements.gameSmallImage.classList.add('hidden');
    }

    // Elapsed Timer
    const startTime = act.timestamps?.start || act.created_at || Date.now();
    state.gameStartTime = startTime;
    updateGameTimer();
    state.gameTimer = setInterval(updateGameTimer, 1000);
}

function nextActivity() {
    if (state.activitiesList.length <= 1) return;
    state.currentActivityIndex = (state.currentActivityIndex + 1) % state.activitiesList.length;
    renderCurrentActivity();
}

function prevActivity() {
    if (state.activitiesList.length <= 1) return;
    state.currentActivityIndex = (state.currentActivityIndex - 1 + state.activitiesList.length) % state.activitiesList.length;
    renderCurrentActivity();
}

function goToActivity(index) {
    if (index < 0 || index >= state.activitiesList.length) return;
    state.currentActivityIndex = index;
    renderCurrentActivity();
}

// Make navigation functions globally accessible for onclick attributes
window.nextActivity = nextActivity;
window.prevActivity = prevActivity;
window.goToActivity = goToActivity;

// ==========================================================================
// 5. Spotify Progress & Game Timers
// ==========================================================================
function updateSpotifyProgress() {
    if (!state.spotifyData || !state.spotifyData.timestamps) return;

    const { start, end } = state.spotifyData.timestamps;
    const now = Date.now();
    const totalDuration = end - start;
    const currentProgress = Math.max(0, Math.min(now - start, totalDuration));

    const progressPercent = Math.min(100, Math.max(0, (currentProgress / totalDuration) * 100));

    if (elements.spotifyProgressFill) {
        elements.spotifyProgressFill.style.width = `${progressPercent}%`;
    }
    if (elements.spotifyCurrentTime) {
        elements.spotifyCurrentTime.textContent = formatTime(currentProgress);
    }
    if (elements.spotifyTotalTime) {
        elements.spotifyTotalTime.textContent = formatTime(totalDuration);
    }
}

function updateGameTimer() {
    if (!state.gameStartTime) return;
    const elapsed = Date.now() - state.gameStartTime;
    if (elements.gameTimer) {
        elements.gameTimer.textContent = formatDuration(elapsed);
    }
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}g ${minutes < 10 ? '0' : ''}${minutes}m`;
    }
    return `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// ==========================================================================
// 6. Interactive Features (Toast, Clipboard, 3D Tilt, Spotlight)
// ==========================================================================
function copyDiscordTag() {
    const tag = '@tekki2137';
    navigator.clipboard.writeText('tekki2137').then(() => {
        showToast(`Skopiowano ${tag} do schowka!`);
    }).catch(() => {
        showToast(`Tag Discord: ${tag}`);
    });
}
window.copyDiscordTag = copyDiscordTag;

function showToast(message) {
    if (!elements.toast) return;
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 2800);
}

// Mouse Spotlight Tracker
window.addEventListener('mousemove', (e) => {
    document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
    document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
});

// 3D Card Tilt Effect
function initTiltEffect() {
    const cards = document.querySelectorAll('[data-tilt]');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((y - centerY) / centerY) * -6;
            const rotateY = ((x - centerX) / centerX) * 6;
            
            card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-3px) scale(1.02)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)';
        });
    });
}

// ==========================================================================
// 7. Bootloader
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initYear();
    initTiltEffect();
    initLanyard();
});
