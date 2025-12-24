document.addEventListener('DOMContentLoaded', () => {
    const fixturesToggle = document.getElementById('fixturesEnabled');
    const leagueToggle = document.getElementById('leagueEnabled');

    // Load initial state
    chrome.storage.sync.get({
        fixturesEnabled: true,
        leagueEnabled: true
    }, (items) => {
        fixturesToggle.checked = items.fixturesEnabled;
        leagueToggle.checked = items.leagueEnabled;
    });

    const columnSettings = document.getElementById('columnSettings');
    const columnCheckboxes = [
        'col_or', 'col_last5', 'col_tpb', 'col_pntl', 'col_tv',
        'col_gwt', 'col_tt', 'col_captain', 'col_chip', 'col_chips', 'col_team'
    ];

    function updateColumnSettingsState(enabled) {
        if (enabled) {
            columnSettings.classList.remove('disabled');
        } else {
            columnSettings.classList.add('disabled');
        }
    }

    // Load initial state
    const defaultSettings = {
        fixturesEnabled: true,
        leagueEnabled: true
    };
    columnCheckboxes.forEach(id => {
        defaultSettings[id] = true;
    });

    chrome.storage.sync.get(defaultSettings, (items) => {
        fixturesToggle.checked = items.fixturesEnabled;
        leagueToggle.checked = items.leagueEnabled;
        updateColumnSettingsState(items.leagueEnabled);

        columnCheckboxes.forEach(id => {
            const cb = document.getElementById(id);
            if (cb) cb.checked = items[id];
        });
    });

    // Save on change
    fixturesToggle.addEventListener('change', () => {
        chrome.storage.sync.set({
            fixturesEnabled: fixturesToggle.checked
        });
    });

    leagueToggle.addEventListener('change', () => {
        chrome.storage.sync.set({
            leagueEnabled: leagueToggle.checked
        });
        updateColumnSettingsState(leagueToggle.checked);
    });

    columnCheckboxes.forEach(id => {
        const cb = document.getElementById(id);
        if (cb) {
            cb.addEventListener('change', () => {
                const update = {};
                update[id] = cb.checked;
                chrome.storage.sync.set(update);
            });
        }
    });
});
