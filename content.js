// content.js

let fixturesCache = null;
let teamsCache = null;
let playersCache = null;

const DIFFICULTY_COLORS = {
    1: 'fixture-diff-2',
    2: 'fixture-diff-2',
    3: 'fixture-diff-3',
    4: 'fixture-diff-4',
    5: 'fixture-diff-5'
};

async function fetchData() {
    if (fixturesCache && teamsCache) return;

    try {
        const bootstrapRes = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/');
        if (!bootstrapRes.ok) throw new Error(`Bootstrap fetch failed: ${bootstrapRes.status}`);
        const bootstrapData = await bootstrapRes.json();

        teamsCache = {};
        bootstrapData.teams.forEach(t => {
            teamsCache[t.id] = {
                short_name: t.short_name,
                name: t.name,
                ownership: null
            };
        });

        playersCache = {};
        const teamOwnership = {};
        bootstrapData.elements.forEach(p => {
            const code = p.photo.replace('.jpg', '').replace('.png', '');
            playersCache[code] = {
                team: p.team,
                selected_by_percent: p.selected_by_percent,
                web_name: p.web_name,
                element_type: p.element_type,
                stats: {
                    goals: p.goals_scored,
                    assists: p.assists,
                    clean_sheets: p.clean_sheets,
                    goals_conceded: p.goals_conceded
                }
            };

            if (!teamOwnership[p.team]) teamOwnership[p.team] = [];
            teamOwnership[p.team].push(parseFloat(p.selected_by_percent));
        });

        Object.keys(teamOwnership).forEach(teamId => {
            const avg = teamOwnership[teamId].reduce((a, b) => a + b, 0) / teamOwnership[teamId].length;
            teamsCache[teamId].ownership = avg.toFixed(1);
        });

        const fixturesRes = await fetch('https://fantasy.premierleague.com/api/fixtures/?future=1');
        if (!fixturesRes.ok) throw new Error(`Fixtures fetch failed: ${fixturesRes.status}`);
        const fixturesData = await fixturesRes.json();

        fixturesCache = {};
        fixturesData.forEach(fix => {
            if (!fixturesCache[fix.team_h]) fixturesCache[fix.team_h] = [];
            fixturesCache[fix.team_h].push({
                opponentId: fix.team_a,
                isHome: true,
                difficulty: fix.team_h_difficulty,
                event: fix.event
            });

            if (!fixturesCache[fix.team_a]) fixturesCache[fix.team_a] = [];
            fixturesCache[fix.team_a].push({
                opponentId: fix.team_h,
                isHome: false,
                difficulty: fix.team_a_difficulty,
                event: fix.event
            });
        });

        for (const teamId in fixturesCache) {
            fixturesCache[teamId].sort((a, b) => (a.event || 999) - (b.event || 999));
        }

        checkLayout();

    } catch (err) {
        console.error('FPL Extension: Error fetching data', err);
    }
}

function checkLayout() {
    if (window.location.href.includes('/transfers') || window.location.href.includes('/my-team/transfers')) {
        document.body.classList.add('fpl-extension-transfers-page');
    } else {
        document.body.classList.remove('fpl-extension-transfers-page');
    }
}

function getNext5Fixtures(teamId) {
    if (!fixturesCache || !fixturesCache[teamId]) return [];
    return fixturesCache[teamId].slice(0, 5);
}

function createFixtureElement(fixture) {
    const box = document.createElement('div');
    const difficultyClass = DIFFICULTY_COLORS[fixture.difficulty] || 'fixture-diff-3';
    box.className = `fpl-fixture-box ${difficultyClass} ${fixture.isHome ? 'fixture-box-home' : 'fixture-box-away'}`;

    const opponent = teamsCache[fixture.opponentId];
    let oppName = opponent ? opponent.short_name.toUpperCase() : '?';

    if (fixture.isHome) {
        oppName += ' (H)';
    } else {
        oppName += ' (A)';
    }

    box.innerText = oppName;
    // box.title removed by request
    return box;
}

function createOwnershipElement(percent) {
    const div = document.createElement('div');
    div.className = 'fpl-ownership-display';
    div.innerText = `${percent}%`;
    return div;
}

function createStatsElement(text) {
    const div = document.createElement('div');
    div.className = 'fpl-stats-display';
    div.innerText = text;
    return div;
}

function findInjectionTarget(container) {
    const nameEl = container.querySelector('[class*="Element__Name"]') ||
        container.querySelector('[class*="ElementInTable__Name"]');
    if (nameEl) return nameEl;
    return container;
}

function injectFixtures(playerElement) {
    if (playerElement.querySelector('.fpl-extension-container')) return;

    const img = playerElement.querySelector('img[src*="/shirts/"]') ||
        playerElement.querySelector('img');

    if (!img) return;

    const teamName = img.alt;
    if (!teamName) return;

    let teamId = null;
    let teamData = null;

    for (const [id, data] of Object.entries(teamsCache)) {
        if (data.name.toLowerCase() === teamName.toLowerCase() ||
            data.name.toLowerCase().includes(teamName.toLowerCase()) ||
            teamName.toLowerCase().includes(data.name.toLowerCase())) {
            teamId = parseInt(id);
            teamData = data;
            break;
        }
    }

    if (!teamData) return;

    const fixtures = getNext5Fixtures(teamId);
    if (!fixtures.length) return;

    const container = document.createElement('div');
    container.className = 'fpl-extension-container';

    // Try to find player name for individual TSB
    const allElements = Array.from(playerElement.querySelectorAll('*'));

    let playerNameEl = null;
    let bestNameCandidate = null;
    let highestScore = 0;

    for (const el of allElements) {
        const text = el.textContent.trim();
        if (!text || text.length === 0 || text.length > 30) continue;

        let score = 0;

        if (text.includes('£')) score -= 100;
        if (text.includes('%')) score -= 100;
        if (text.includes('.') && /^\d+\.?\d*$/.test(text)) score -= 100;
        if (/^\d+$/.test(text)) score -= 100;
        if (text.length < 3) score -= 50;

        if (/^[A-Z][a-z]+/.test(text)) score += 50;
        if (/^[A-Z]/.test(text) && text.length >= 4 && text.length <= 20) score += 30;
        if (/[a-zA-Z]{3,}/.test(text)) score += 20;

        if (el.className && el.className.includes('Name')) score += 40;
        if (el.className && el.className.includes('name')) score += 40;

        if (score > highestScore) {
            highestScore = score;
            bestNameCandidate = el;
        }
    }

    if (highestScore > 0) {
        playerNameEl = bestNameCandidate;
    }

    let playerOwnership = null;
    let foundPlayerData = null;

    if (playerNameEl) {
        const playerName = playerNameEl.textContent.trim();

        let foundMatch = false;
        for (const [code, playerData] of Object.entries(playersCache)) {
            if (playerData.web_name &&
                playerData.web_name.toLowerCase() === playerName.toLowerCase() &&
                playerData.team === teamId) {
                playerOwnership = playerData.selected_by_percent;
                foundPlayerData = playerData;
                foundMatch = true;
                break;
            }
        }

        if (!foundMatch) {
            for (const [code, playerData] of Object.entries(playersCache)) {
                if (playerData.web_name && playerData.team === teamId &&
                    (playerData.web_name.toLowerCase().includes(playerName.toLowerCase()) ||
                        playerName.toLowerCase().includes(playerData.web_name.toLowerCase()))) {
                    playerOwnership = playerData.selected_by_percent;
                    foundPlayerData = playerData;
                    break;
                }
            }
        }
    }

    const ownershipToShow = playerOwnership || teamData.ownership;
    if (ownershipToShow) {
        const ownDiv = createOwnershipElement(ownershipToShow);
        container.appendChild(ownDiv);
    }

    const fixturesRow = document.createElement('div');
    fixturesRow.className = 'fpl-next-fixtures';
    fixtures.forEach(fix => {
        fixturesRow.appendChild(createFixtureElement(fix));
    });
    container.appendChild(fixturesRow);

    if (foundPlayerData) {
        const {
            element_type,
            stats
        } = foundPlayerData;
        let statsText = '';

        if (element_type === 1) { // GKP
            statsText = `CS: ${stats.clean_sheets}`;
        } else if (element_type === 2) { // DEF
            statsText = ``;
        } else if (element_type === 3) { // MID
            statsText = `G: ${stats.goals} A: ${stats.assists}`;
        } else if (element_type === 4) { // FWD
            statsText = `G: ${stats.goals} A: ${stats.assists}`;
        }

        if (statsText) {
            container.appendChild(createStatsElement(statsText));
        }
    }

    const target = findInjectionTarget(playerElement);

    if (target && target !== playerElement) {
        target.parentNode.insertBefore(container, target.nextSibling);
    } else {
        playerElement.appendChild(container);
    }
}

function runInjection() {
    const shirtImages = document.querySelectorAll('img[src*="/shirts/"]');
    if (shirtImages.length === 0) return;

    shirtImages.forEach((img) => {
        let container = null;

        container = img.closest('[role="button"]');
        if (!container) container = img.closest('[role="row"]');
        if (!container) container = img.closest('li');

        if (!container) container = img.closest('[class*="Element"]');
        if (!container) container = img.closest('[class*="Pitch"]');
        if (!container) container = img.closest('[class*="Player"]');

        if (!container) {
            const picture = img.closest('picture');
            if (picture) {
                container = picture.parentElement?.parentElement;
            }
        }

        if (!container) {
            let parent = img.parentElement;
            let depth = 0;
            while (parent && depth < 5) {
                if (parent.offsetHeight > 100 || parent.classList.length > 0) {
                    container = parent;
                    break;
                }
                parent = parent.parentElement;
                depth++;
            }
        }

        if (container) {
            injectFixtures(container);
        }
    });

    checkLayout();
}

const observer = new MutationObserver((mutations) => {
    if (!teamsCache) return;
    runInjection();
});

(async () => {
    await fetchData();
    runInjection();

    const appRoot = document.body;
    observer.observe(appRoot, { childList: true, subtree: true, attributes: false });

    for (let i = 1; i <= 10; i++) {
        setTimeout(runInjection, i * 500);
    }
})();
