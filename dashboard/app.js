// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the top picks, the ranked board, the early radar and a per-protocol detail drawer
// with the model's own inputs and the protocol's farm plan. No network: every byte it shows
// is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', watch: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var byRank = DATA.rows.slice().sort(function (a, b) { return a.rank - b.rank; });
  // The implied-value bars are log-scaled against the whole board, so a bar means the same
  // thing however the table is sorted or filtered.
  var logLo = Math.log(Math.min.apply(null, DATA.rows.map(function (r) { return r.implied_value_usd; })));
  var logHi = Math.log(Math.max.apply(null, DATA.rows.map(function (r) { return r.implied_value_usd; })));
  function barWidth(v) { return Math.round(4 + 96 * (Math.log(v) - logLo) / Math.max(1e-9, logHi - logLo)); }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var reach = 1 + model.reach_per_chain * Math.min(Math.max((row.chains ? row.chains.length : 0) - 1, 0), model.reach_max_extra);
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * reach));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL,
  // seven-day momentum and age decide the actions, the capital, the hold and every cost and time.
  // No name is special-cased.
  function slugHash(slug) {
    var h = 0;
    for (var i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
    return h;
  }
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function secondActionFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('cdp') >= 0) return { text: 'Mint the stablecoin ' + name + ' issues against your collateral at a conservative ratio, and park the minted coins in the deepest pool for them on ' + chain + '.', cost: 'about $3 of gas, and the collateral stays locked', time: '15 minutes' };
    if (c.indexOf('lend') >= 0 || c.indexOf('collateral') >= 0) return { text: 'Borrow against the position once — no more than a third of what you supplied — supply the borrowed funds back, and check the health factor every week after.', cost: 'about $3 of gas for the loop', time: '15 minutes, then 2 minutes a week' };
    if (c.indexOf('dex') >= 0) return { text: "Make two or three small swaps through " + name + " on " + chain + " in the same session, so the wallet's record shows trading activity as well as liquidity.", cost: 'about $2 of gas and the swap fees', time: '10 minutes' };
    if (c.indexOf('bridge') >= 0) return { text: 'Bridge a second, smaller amount back the other way a few days later, so the wallet has traffic through ' + name + ' in both directions.', cost: 'bridge fees of about $3 to $10', time: '15 minutes' };
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('option') >= 0) return { text: 'Open one small position on ' + name + ' and close it the same week, then repeat on the other side, so the record shows real trading rather than one deposit.', cost: 'trading fees of about $2 to $5 a round trip', time: '15 minutes a week' };
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return { text: "Split the position: keep two thirds of it in " + name + "'s largest vault and move one third into a second vault it curates, so the wallet holds more than one strategy.", cost: 'about $3 of gas for the second deposit', time: '10 minutes' };
    if (c.indexOf('prediction') >= 0) return { text: 'Place small positions in two more markets on ' + name + ', on different days, and let at least one of them settle before you add any funds.', cost: 'the stake in each market, kept small', time: '10 minutes a market' };
    if (c.indexOf('rwa') >= 0) return { text: "Read " + name + "'s redemption terms before you add more: write the lock-up and the exit window in your farm log, and mint a second small tranche only inside that window.", cost: 'nothing to read the terms', time: '15 minutes' };
    if (c.indexOf('chain') >= 0) return { text: 'Use two of the applications live on ' + name + ' itself — a swap and a deposit — so the wallet is active on the chain, not only bridged into it.', cost: 'about $3 of gas in total', time: '20 minutes' };
    if (c.indexOf('stable') >= 0) return { text: 'Swap a small amount into the paired asset ' + name + ' is built around and hold both sides for a week, so the wallet uses the peg mechanism and not only the deposit box.', cost: 'about $2 of gas and the swap fee', time: '10 minutes' };
    return { text: 'Repeat the core action a second time with a smaller amount a few days later, so the wallet\'s record is a pattern of use, not a single visit.', cost: 'about $2 of gas', time: '10 minutes' };
  }
  function cadenceStep(p) {
    var change = p.change_7d;
    var cost = 'about $2 of gas a week';
    var time = '10 minutes a week';
    if (change === null || change === undefined) return { text: 'Make one qualifying action each week — a deposit, a borrow, a swap or a vote — and keep the cadence even: the record shows no seven-day TVL change for ' + p.name + ', so steady use is the signal to build.', cost: cost, time: time };
    var shown = (change > 0 ? '+' : '') + change.toFixed(1) + '%';
    if (change >= 10) return { text: 'TVL is up ' + shown + ' in seven days: growth windows are when points programs tend to open, so finish the first full cycle this week rather than next, then keep one qualifying action a week.', cost: cost, time: time };
    if (change <= -10) return { text: 'TVL is down ' + shown + ' in seven days: keep the position at the starter size, make one small qualifying action a week, and add nothing until two weekly checks in a row stop falling.', cost: cost, time: time };
    return { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep the size steady while TVL moves sideways (' + shown + ' in seven days).', cost: cost, time: time };
  }
  function holdStep(p, age, capital) {
    var hold = holdDaysFor(age);
    var cost = 'the $' + capital + ' stays in the position';
    var time = hold + ' days';
    if (age !== null && age !== undefined && age < 120) return { text: p.name + ' was first listed ' + age + ' days ago: hold the position for at least ' + hold + " days — a launch's first snapshot usually reaches back to the earliest wallets, and this one is still early.", cost: cost, time: time };
    if (age !== null && age !== undefined && age > 730) return { text: 'Hold for at least ' + hold + ' days, then reassess: ' + p.name + ' has run ' + (age / 365).toFixed(1) + ' years with no token, so keep the position only while its cost stays near zero and treat any launch as a bonus, not a plan.', cost: cost, time: time };
    return { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: cost, time: time };
  }
  function farmSteps(p) {
    var age = p.age_days === undefined ? null : p.age_days;
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var steps = [
      slugHash(p.slug) % 2 === 0
        ? { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' }
        : { text: 'Create a wallet you use only for this farm, fund it from your main wallet, and store its seed phrase on paper — never in a screenshot or a cloud note.', cost: 'under $3 of gas to fund it', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      secondActionFor(p, chain)
    ];
    if (p.chains && p.chains.length >= 2) {
      steps.push({ text: 'Repeat the core action on ' + p.chains[1] + ': ' + p.name + ' runs on ' + p.chains.length + ' chains, and activity is usually counted per chain, so a second chain doubles the surfaces a snapshot can see.', cost: 'bridge fees of about $3 to $10, plus gas on ' + p.chains[1], time: '20 minutes' });
    }
    steps.push(cadenceStep(p));
    steps.push(holdStep(p, age, capital));
    steps.push({ text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' });
    steps.push({ text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' });
    return steps.map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('watch')) state.watch = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.watch) params.set('watch', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function defaultView() { return !state.q && state.category === 'all' && !state.watch; }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function tagFor(r) {
    return r.watchlist
      ? el('span', { class: 'tag tag-watch', text: 'Watchlist' })
      : el('span', { class: 'tag tag-early', text: 'Early' });
  }
  function metaLine(r) {
    return (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain');
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which launch is worth farming next?' }),
        el('p', null,
          el('b', { text: DATA.board_size + ' pre-token protocols' }),
          ' ranked by implied value. The watchlist is the floor — ' + DATA.watchlist_size + ' protocols at or above $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL with no token on record — and the early radar adds ',
          el('b', { text: DATA.early_size + ' more below it' }),
          '. Every row carries the steps to farm it. Implied value is a model, not a promise.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var watchBtn = el('button', { type: 'button', class: 'watch-toggle', 'aria-pressed': state.watch ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watch = !state.watch; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Floor' }), watchBtn),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function picks() {
    var top = byRank.slice(0, 3);
    return el('section', { class: 'picks', 'aria-label': 'Top picks' },
      top.map(function (r, i) {
        return el('article', { class: 'pick', tabindex: '0', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
          el('div', { class: 'pick-head' },
            el('span', { class: 'pick-rank', text: '#' + (i + 1) }),
            tagFor(r)
          ),
          el('h2', { class: 'pick-name', text: r.name }),
          el('div', { class: 'pick-value num', text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'pick-meta' },
            el('span', null, 'TVL ', el('b', { class: 'num', text: fmtUsd(r.tvl_usd) })),
            el('span', { class: r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg' }, '7d ', el('b', { class: 'num', text: r.change_7d === null ? 'n/a' : fmtPct(r.change_7d) })),
            el('span', null, 'Age ', el('b', { class: 'num', text: fmtAge(r.age_days) }))
          ),
          el('p', { class: 'sub', text: metaLine(r) })
        );
      })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        'data-top': r.rank <= 3 ? String(r.rank) : null,
        'data-watch': r.watchlist ? '1' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('div', { class: 'name-line' }, el('b', { text: r.name }), tagFor(r)),
          el('span', { class: 'sub', text: metaLine(r) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + barWidth(r.implied_value_usd) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.reach_per_chain + ' x min(chains - 1, ' + m.reach_max_extra + ')) )'
      ),
      el('p', { class: 'sub', text: 'The category multiple is priced by the market itself, in log space: every protocol that already records a token contributes its market cap over TVL, clamped to [' + m.ratio_lo + ', ' + m.ratio_hi + '], and a category is priced at the median of its peers\' log ratios, shrunk toward the global log median by its peer count (shrinkage ' + m.shrink_k + ', from ' + DATA.peer_count + ' priced peers; the global multiple is ' + DATA.global_multiple + 'x). Pricing in log space keeps one outsized print from carrying a whole category. A category with no priced peer takes the global median. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Reach counts the chains a protocol operates on: each chain past the first adds ' + (m.reach_per_chain * 100) + '% up to ' + m.reach_max_extra + ' extra chains, because a launch is priced by every chain it reaches. The board ranks every protocol that records no token and is not a wrapped, staked or bridged product of one that trades; the live-token protocols are set aside with their market caps shown.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var m = DATA.model;
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: metaLine(row) })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('div', { class: 'hero' },
      el('div', { class: 'hero-top' },
        el('span', { class: 'hero-label', text: 'Implied value' }),
        tagFor(row)
      ),
      el('div', { class: 'hero-value num', text: fmtUsd(row.implied_value_usd) }),
      el('p', { class: 'sub', text: 'TVL ' + fmtUsd(row.tvl_usd) + ' · ' + (row.change_7d === null ? 'no seven-day change reported' : fmtPct(row.change_7d) + ' in seven days') + ' · ' + fmtAge(row.age_days) + ' with no token on record' })
    ));
    // Each multiplier drawn against the full range the model allows it, from the model's own
    // constants, so a reader sees not just the number but how much of the dial it turns.
    function brow(label, shown, frac, note) {
      var pct = Math.max(2, Math.min(100, Math.round(frac * 100)));
      return el('div', { class: 'brow' },
        el('div', { class: 'brow-top' }, el('span', { text: label }), el('b', { class: 'num', text: shown })),
        el('div', { class: 'bbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + pct + '%' })),
        el('p', { class: 'sub', text: note })
      );
    }
    var growthLo = 1 + (m.growth_floor / 100) * m.growth_weight;
    var growthHi = 1 + (m.growth_cap / 100) * m.growth_weight;
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'How the model gets there' }),
      el('div', { class: 'breakdown' },
        brow('Category multiple', row.category_multiple.toFixed(4) + ' x',
          (Math.log(row.category_multiple) - Math.log(m.ratio_lo)) / (Math.log(m.ratio_hi) - Math.log(m.ratio_lo)),
          'Priced from ' + row.peer_count + ' tokenised peer' + (row.peer_count === 1 ? '' : 's') + ' in ' + (row.category || 'its category') + ' (market cap over TVL, log median).'),
        brow('Growth multiplier', String(row.growth_multiplier),
          (row.growth_multiplier - growthLo) / (growthHi - growthLo),
          'Seven-day TVL change of ' + fmtPct(row.change_7d) + ', clamped to [' + m.growth_floor + '%, +' + m.growth_cap + '%] and weighted ' + m.growth_weight + '.'),
        brow('Maturity multiplier', String(row.maturity_multiplier),
          (row.maturity_multiplier - m.maturity_floor) / m.maturity_range,
          fmtAge(row.age_days) + ' listed with no token, against a ' + Math.round(m.maturity_days / 365) + '-year maturity horizon.'),
        brow('Reach multiplier', String(row.reach_multiplier),
          (row.reach_multiplier - 1) / (m.reach_per_chain * m.reach_max_extra),
          (row.chains ? row.chains.length : 0) + ' chain' + (row.chains && row.chains.length === 1 ? '' : 's') + ': each chain past the first adds ' + (m.reach_per_chain * 100) + '%, up to ' + m.reach_max_extra + ' extra.')
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, m)) + (impliedOf(row, m) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var rest = at >= 0 ? s.slice(at + 7) : '';
        var timeAt = rest.indexOf('. Time: ');
        var cost = timeAt >= 0 ? rest.slice(0, timeAt) : rest;
        var time = timeAt >= 0 ? rest.slice(timeAt + 8).replace(/\.$/, '') : '';
        return el('li', { class: 'step-card' },
          el('b', { text: action }),
          el('div', { class: 'step-meta' },
            el('span', { class: 'chip', text: 'Cost · ' + cost }),
            time ? el('span', { class: 'chip', text: 'Time · ' + time }) : null
          )
        );
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function earlySection() {
    var early = byRank.filter(function (r) { return !r.watchlist; }).slice(0, 10);
    return el('section', { class: 'early', 'aria-label': 'Early radar' },
      el('div', { class: 'section-head' },
        el('h2', { text: 'Early radar' }),
        el('p', { class: 'sub', text: 'Below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor: ' + DATA.early_size + ' pre-token protocols the watchlist does not name, the ten strongest shown. This is where a launch is found before it is obvious.' })
      ),
      el('div', { class: 'early-grid' },
        early.map(function (r) {
          return el('article', { class: 'ecard', tabindex: '0', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
            el('div', { class: 'pick-head' },
              el('span', { class: 'erank', text: 'Rank ' + r.rank }),
              el('span', { class: 'tag tag-early', text: 'Early' })
            ),
            el('h3', { class: 'pick-name', text: r.name }),
            el('div', { class: 'ecard-value num', text: fmtUsd(r.implied_value_usd) }),
            el('div', { class: 'pick-meta' },
              el('span', null, 'TVL ', el('b', { class: 'num', text: fmtUsd(r.tvl_usd) })),
              el('span', { class: r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg' }, '7d ', el('b', { class: 'num', text: r.change_7d === null ? 'n/a' : fmtPct(r.change_7d) })),
              el('span', null, 'Age ', el('b', { class: 'num', text: fmtAge(r.age_days) }))
            ),
            el('p', { class: 'sub', text: metaLine(r) })
          );
        })
      )
    );
  }

  function foot() {
    return el('footer', { class: 'foot' },
      el('span', { text: 'Source: ' + DATA.source }),
      el('span', { text: 'Implied value is this radar\u2019s model (' + DATA.model_version + '), not a price or a promise.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') {
      if (defaultView()) shell.appendChild(picks());
      shell.appendChild(boardTable());
      if (defaultView()) shell.appendChild(earlySection());
      shell.appendChild(modelPanel());
    } else {
      shell.appendChild(liveTable());
    }
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
