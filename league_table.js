// league_table.js
console.log('Fpl-Buddy: league_table.js loaded');

let hasInjectedHeaders = false;
let bootstrapData = null;
let currentEventId = null;

// Cache to prevent re-fetching for the same manager if they navigate back/forth
const managerCache = {};

async function fetchBootstrap() {
    if (bootstrapData) return bootstrapData;
    try {
        const res = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/');
        const data = await res.json();
        bootstrapData = data;

        // Find current event
        const currentEvent = data.events.find(e => e.is_current);
        if (currentEvent) {
            currentEventId = currentEvent.id;
        } else {
            // Fallback if no current event (e.g. pre-season or breaks), find next or last finished?
            // Usually just take the one that is 'current' or closest.
            const next = data.events.find(e => e.is_next);
            currentEventId = next ? next.id - 1 : 1;
            if (currentEventId < 1) currentEventId = 1;
        }
        return data;
    } catch (e) {
        console.error("Fpl-Buddy: Failed to fetch bootstrap", e);
    }
}

async function fetchEntryHistory(entryId) {
    if (managerCache[entryId] && managerCache[entryId].history) return managerCache[entryId].history;
    try {
        const res = await fetch(`https://fantasy.premierleague.com/api/entry/${entryId}/history/`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!managerCache[entryId]) managerCache[entryId] = {};
        managerCache[entryId].history = data;
        return data;
    } catch (e) {
        console.error(`Fpl-Buddy: Failed to fetch history for ${entryId}`, e);
        return null;
    }
}

async function fetchEntryPicks(entryId, eventId) {
    if (!eventId) return null;
    if (managerCache[entryId] && managerCache[entryId].picks && managerCache[entryId].picks[eventId]) return managerCache[entryId].picks[eventId];

    try {
        const res = await fetch(`https://fantasy.premierleague.com/api/entry/${entryId}/event/${eventId}/picks/`);
        if (!res.ok) return null;
        const data = await res.json();

        if (!managerCache[entryId]) managerCache[entryId] = {};
        if (!managerCache[entryId].picks) managerCache[entryId].picks = {};
        managerCache[entryId].picks[eventId] = data;
        return data;
    } catch (e) {
        console.error(`Fpl-Buddy: Failed to fetch picks for ${entryId} GW ${eventId}`, e);
        return null;
    }
}

function processTable() {
    const table = document.querySelector('table');
    if (!table) return;

    // Check if we already processed this specific table instance
    // Relaxed check: if we processed it but now the columns are gone (re-render), we might need to process again.
    // But dataset persists on element usually.
    if (table.dataset.fplBuddyProcessed === "true") {
        // If processed, check if new rows appeared (lazy loading/scrolling)
        const unprocessedRows = table.querySelectorAll('tbody tr:not([data-fpl-buddy-row-processed])');
        if (unprocessedRows.length > 0) {
            unprocessedRows.forEach((row, index) => {
                setTimeout(() => {
                    processRow(row);
                }, index * 50);
            });
        }
        return;
    }

    // Only process if it looks like a standings table
    const headers = Array.from(table.querySelectorAll('th'));
    const headerTexts = headers.map(th => th.innerText.trim());
    console.log('Fpl-Buddy: Checking table headers:', headerTexts);

    // Relaxed check: Just look for 'GW' or 'Tot' or 'Rank'
    const isStandings = (headerTexts.some(t => t.includes('Rank') || t === '#' || t === '')) &&
        (headerTexts.some(t => t.includes('GW') || t.includes('Tot') || t.includes('Total')));

    if (!isStandings) {
        console.log('Fpl-Buddy: Table does not look like standings.');
        document.body.classList.remove('fpl-buddy-league-page');
        return;
    }

    document.body.classList.add('fpl-buddy-league-page');

    console.log('Fpl-Buddy: Standings table found! Processing...');
    table.dataset.fplBuddyProcessed = "true";
    table.classList.add('fpl-buddy-table');

    // Inject Headers
    console.log('Fpl-Buddy: Injecting headers...');
    injectHeaders(table);

    // Process Rows
    const rows = table.querySelectorAll('tbody tr');
    console.log(`Fpl-Buddy: Found ${rows.length} rows to process.`);
    rows.forEach((row, index) => {
        // Reduced delay to 50ms for faster loading while still respecting API
        setTimeout(() => {
            processRow(row);
        }, index * 50);
    });
}

function injectHeaders(table) {
    const thead = table.querySelector('thead tr');
    if (!thead) {
        console.log('Fpl-Buddy: No thead row found!');
        return;
    }

    // Check if we already injected headers in this specific thead
    if (thead.querySelector('.fpl-buddy-col-header')) {
        console.log('Fpl-Buddy: Headers already present.');
        return;
    }

    const headers = [
        'OR', 'Last 5', 'TPB', 'PNTL', 'TV', 'GWT(C)', 'TT(C)', 'Captain', 'Chip', 'Chips', 'Team'
    ];

    console.log('Fpl-Buddy: Appending headers to:', thead);

    headers.forEach(h => {
        const th = document.createElement('th');
        th.innerText = h;
        th.className = 'fpl-buddy-col-header';
        // Explicitly set scope/style to mimic existing
        th.setAttribute('scope', 'col');
        thead.appendChild(th);
    });
    console.log('Fpl-Buddy: Headers injected successfully.');
}

async function processRow(row) {
    if (row.dataset.fplBuddyRowProcessed === "true") return;
    row.dataset.fplBuddyRowProcessed = "true";

    // Extract Entry ID
    const link = row.querySelector('a[href*="/entry/"]');
    if (!link) return;

    const hrefParts = link.getAttribute('href').split('/');
    const entryIdIndex = hrefParts.indexOf('entry') + 1;
    if (entryIdIndex === 0 || entryIdIndex >= hrefParts.length) return;

    const entryId = hrefParts[entryIdIndex];
    if (!entryId) return;

    // console.log(`Fpl-Buddy: Processing entry ${entryId}...`);

    // Fetch Data
    if (!bootstrapData) await fetchBootstrap();
    const historyData = await fetchEntryHistory(entryId);
    const picksData = await fetchEntryPicks(entryId, currentEventId);

    if (!historyData || !picksData) {
        console.log(`Fpl-Buddy: Missing data for ${entryId}`);
        // Inject empty cells to keep layout
        injectEmptyCells(row, 11);
        return;
    }

    // Calculate Stats
    const stats = calculateStats(historyData, picksData);

    // Inject Cells
    injectDataCells(row, stats, entryId);
    // console.log(`Fpl-Buddy: Injected data for ${entryId}`);
}

function calculateStats(history, picks) {
    const current = history.current;

    // OR: check if we have rank in current event, else last
    const lastEvent = current[current.length - 1];
    const overallRank = lastEvent ? lastEvent.overall_rank : '-';

    // Last 5: Points
    const last5Events = current.slice(-5);
    const last5Points = last5Events.map(e => e.points - e.event_transfers_cost).join('|');

    // TPB (Total Bench Points): Cumulative
    const totalBench = current.reduce((acc, curr) => acc + curr.points_on_bench, 0);

    // PNTL (Total Hits cost)
    const totalHits = current.reduce((acc, curr) => acc + curr.event_transfers_cost, 0);

    // TV (Team Value)
    const tv = lastEvent ? (lastEvent.value / 10).toFixed(1) : '-';

    // GWT(C) - Current GW transfers
    const gwTransfers = lastEvent ? lastEvent.event_transfers : 0;
    const gwHit = lastEvent ? lastEvent.event_transfers_cost : 0;
    const gwtDisplay = `${gwTransfers} (${gwHit})`;

    // TT(C) - Total Transfers
    const totalTransfers = current.reduce((acc, curr) => acc + curr.event_transfers, 0);
    const ttDisplay = `${totalTransfers} (${totalHits})`;

    // Captain
    const captainPick = picks.picks.find(p => p.is_captain);
    // Need player name from bootstrap
    const captainName = getPlayerName(captainPick ? captainPick.element : null);

    // Active Chip
    const activeChip = picks.active_chip ? convertChipName(picks.active_chip) : 'None';

    // Chips History
    const usedChips = history.chips.map(c => `${convertChipName(c.name)} (GW${c.event})`).join(', ');

    return {
        overallRank,
        last5Points,
        totalBench,
        totalHits,
        tv,
        gwtDisplay,
        ttDisplay,
        captainName,
        activeChip,
        usedChips
    };
}

function getPlayerName(elementId) {
    if (!elementId || !bootstrapData) return '?';
    const p = bootstrapData.elements.find(e => e.id === elementId);
    return p ? p.web_name : '?';
}

function convertChipName(name) {
    const map = {
        '3xc': 'TC',
        'wildcard': 'WC',
        'freehit': 'FH',
        'bboost': 'BB',
        'manager': 'Man'
    };
    return map[name] || name;
}

function injectEmptyCells(row, count) {
    for (let i = 0; i < count; i++) {
        const td = document.createElement('td');
        td.innerHTML = '-';
        row.appendChild(td);
    }
}

function injectDataCells(row, stats, entryId) {
    const values = [
        stats.overallRank,
        stats.last5Points,
        stats.totalBench,
        stats.totalHits,
        stats.tv,
        stats.gwtDisplay,
        stats.ttDisplay,
        stats.captainName,
        stats.activeChip === 'None' ? '' : stats.activeChip,
        stats.usedChips
    ];

    values.forEach(v => {
        const td = document.createElement('td');
        td.className = 'fpl-buddy-col';
        td.textContent = v;
        row.appendChild(td);
    });

    // Team Column (Expandable)
    const teamTd = document.createElement('td');
    teamTd.className = 'fpl-buddy-col';
    const btn = document.createElement('button');
    btn.className = 'fpl-buddy-team-btn';
    btn.textContent = '+';
    btn.onclick = (e) => toggleTeamView(e, entryId, teamTd);
    teamTd.appendChild(btn);
    row.appendChild(teamTd);
}

async function toggleTeamView(e, entryId, container) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Check if already open
    let list = container.querySelector('.fpl-buddy-team-list');
    const btn = container.querySelector('.fpl-buddy-team-btn');

    if (list) {
        // Toggle
        if (list.style.display === 'none') {
            list.style.display = 'block';
            btn.textContent = '-';
            btn.classList.add('open');
        } else {
            list.style.display = 'none';
            btn.textContent = '+';
            btn.classList.remove('open');
        }
        return;
    }

    // First time load
    btn.textContent = '...';

    let picks = await fetchEntryPicks(entryId, currentEventId);
    if (!picks) {
        btn.textContent = 'Err';
        return;
    }

    list = document.createElement('div');
    list.className = 'fpl-buddy-team-list';

    const starting = picks.picks.slice(0, 11);
    const bench = picks.picks.slice(11);

    // Helper to render players
    const renderPlayer = (pick) => {
        const p = bootstrapData.elements.find(el => el.id === pick.element);
        if (!p) return null;

        const row = document.createElement('div');
        row.className = 'fpl-buddy-player-row';

        // Color code points (optional) or just text
        // Format: Name (Pts) or just Name Pts
        const nameSpan = document.createElement('span');
        nameSpan.innerText = p.web_name;

        if (pick.is_captain) nameSpan.innerText += ' (C)';
        if (pick.is_vice_captain) nameSpan.innerText += ' (V)';

        const ptsSpan = document.createElement('span');
        // If captain, points * multiplier
        const pts = p.event_points * pick.multiplier;
        ptsSpan.innerText = pts;
        ptsSpan.className = 'fpl-buddy-player-pts';

        row.appendChild(nameSpan);
        row.appendChild(ptsSpan);

        // Type/Position color bg? The image shows colored rows based on pos? 
        // GKP=1(Yellow), DEF=2(Green), MID=3(Cyan), FWD=4(Red)
        const posColors = { 1: '#e1fa08', 2: '#01fc7a', 3: '#05f0ff', 4: '#ff1751' };
        row.style.backgroundColor = posColors[p.element_type] || '#fff';

        return row;
    };

    starting.forEach(pick => {
        const r = renderPlayer(pick);
        if (r) list.appendChild(r);
    });

    // Divider for bench?
    if (bench.length > 0) {
        const div = document.createElement('div');
        div.className = 'fpl-buddy-bench-divider';
        div.innerText = 'Bench';
        list.appendChild(div);

        bench.forEach(pick => {
            const r = renderPlayer(pick);
            if (r) {
                r.classList.add('fpl-buddy-bench-player');
                list.appendChild(r);
            }
        });
    }

    container.appendChild(list);
    btn.textContent = '-';
    btn.classList.add('open');
}

// Observer
const leagueObserver = new MutationObserver(() => {
    if (window.location.href.includes('/standings/')) {
        processTable();
    } else {
        // Cleanup class if we navigated away from standings
        if (document.body.classList.contains('fpl-buddy-league-page')) {
            document.body.classList.remove('fpl-buddy-league-page');
        }
    }
});

leagueObserver.observe(document.body, { childList: true, subtree: true });

// Initial Trigger
if (window.location.href.includes('/standings/')) {
    processTable();
} else {
    document.body.classList.remove('fpl-buddy-league-page');
}
