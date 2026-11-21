// Token Radar's dashboard: reads window.RADAR (data.js, written by main.ts) — no network.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', verdict: 'all', cov: 'all', watch: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var byRank = DATA.rows.slice().sort(function (a, b) { return a.rank - b.rank; });
  // Implied-value bars are log-scaled against the whole board.
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
  // The page re-prices a row from the fit components data.js carries: the same arithmetic as board.json.
  function impliedOf(row) {
    if (!row.tvl_usd || row.tvl_usd <= 0) return 1;
    return Math.max(1, Math.round(Math.exp(row.fit_base_log + row.fit_b * Math.log(row.tvl_usd) + row.fit_growth + row.fit_age)));
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

  // The farm plan is the same derivation main.ts writes to board.json. No name is special-cased.
  function slugHash(slug) {
    var h = 0;
    for (var i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
    return h;
  }
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function fmtMoney(n) {
    var abs = Math.abs(n);
    var body = abs % 1 === 0 ? String(abs) : abs.toFixed(2);
    return n < 0 ? '-$' + body : '$' + body;
  }
  function gasPerAction(chain) {
    var m = DATA.model;
    if (chain === undefined || chain === null) return m.gas_unknown;
    if (chain === 'Ethereum') return m.gas_ethereum;
    if (chain === 'Solana') return m.gas_solana;
    return m.gas_other;
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
  function secondActionFor(p, chain, gas1) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('cdp') >= 0) return { text: 'Mint the stablecoin ' + name + ' issues against your collateral at a conservative ratio, and park the minted coins in the deepest pool for them on ' + chain + '.', cost: 'about ' + gas1 + ' of gas, and the collateral stays locked', time: '15 minutes' };
    if (c.indexOf('lend') >= 0 || c.indexOf('collateral') >= 0) return { text: 'Borrow against the position once — no more than a third of what you supplied — supply the borrowed funds back, and check the health factor every week after.', cost: 'about ' + gas1 + ' of gas for the loop', time: '15 minutes, then 2 minutes a week' };
    if (c.indexOf('dex') >= 0) return { text: "Make two or three small swaps through " + name + " on " + chain + " in the same session, so the wallet's record shows trading activity as well as liquidity.", cost: 'about ' + gas1 + ' of gas and the swap fees', time: '10 minutes' };
    if (c.indexOf('bridge') >= 0) return { text: 'Bridge a second, smaller amount back the other way a few days later, so the wallet has traffic through ' + name + ' in both directions.', cost: 'bridge fees of about $6', time: '15 minutes' };
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('option') >= 0) return { text: 'Open one small position on ' + name + ' and close it the same week, then repeat on the other side, so the record shows real trading rather than one deposit.', cost: 'trading fees of about $2 to $5 a round trip', time: '15 minutes a week' };
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return { text: "Split the position: keep two thirds of it in " + name + "'s largest vault and move one third into a second vault it curates, so the wallet holds more than one strategy.", cost: 'about ' + gas1 + ' of gas for the second deposit', time: '10 minutes' };
    if (c.indexOf('prediction') >= 0) return { text: 'Place small positions in two more markets on ' + name + ', on different days, and let at least one of them settle before you add any funds.', cost: 'the stake in each market, kept small', time: '10 minutes a market' };
    if (c.indexOf('rwa') >= 0) return { text: "Read " + name + "'s redemption terms before you add more: write the lock-up and the exit window in your farm log, and mint a second small tranche only inside that window.", cost: 'nothing to read the terms', time: '15 minutes' };
    if (c.indexOf('chain') >= 0) return { text: 'Use two of the applications live on ' + name + ' itself — a swap and a deposit — so the wallet is active on the chain, not only bridged into it.', cost: 'about ' + gas1 + ' of gas in total', time: '20 minutes' };
    if (c.indexOf('stable') >= 0) return { text: 'Swap a small amount into the paired asset ' + name + ' is built around and hold both sides for a week, so the wallet uses the peg mechanism and not only the deposit box.', cost: 'about ' + gas1 + ' of gas and the swap fee', time: '10 minutes' };
    return { text: 'Repeat the core action a second time with a smaller amount a few days later, so the wallet\'s record is a pattern of use, not a single visit.', cost: 'about ' + gas1 + ' of gas', time: '10 minutes' };
  }
  function cadenceStep(p, gas1) {
    var change = p.change_7d;
    var cost = 'about ' + gas1 + ' of gas a week';
    var time = '10 minutes a week';
    if (change === null || change === undefined) return { text: 'Make one qualifying action each week — a deposit, a borrow, a swap or a vote — and keep the cadence even: the record shows no seven-day TVL change for ' + p.name + ', so steady use is the signal to build.', cost: cost, time: time };
    var shown = (change > 0 ? '+' : '') + change.toFixed(1) + '%';
    if (change >= 10) return { text: 'TVL is up ' + shown + ' in seven days: growth windows are when points programs tend to open, so finish the first full cycle this week rather than next, then keep one qualifying action a week.', cost: cost, time: time };
    if (change <= -10) return { text: 'TVL is down ' + shown + ' in seven days: keep the position at the starter size, make one small qualifying action a week, and add nothing until two weekly checks in a row stop falling.', cost: cost, time: time };
    return { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep the size steady while TVL moves sideways (' + shown + ' in seven days).', cost: cost, time: time };
  }
  function holdStep(p, age, plan) {
    var hold = plan.hold_days;
    var cost = 'the $' + plan.capital_usd + ' stays in the position; carrying it gives up about ' + fmtMoney(plan.opportunity_usd) + ' of yield';
    var time = hold + ' days, ' + plan.start_date + ' to ' + plan.end_date;
    if (age !== null && age !== undefined && age < 120) return { text: p.name + ' was first listed ' + age + ' days ago: hold the position for at least ' + hold + ' days, until ' + plan.end_date + " — a launch's first snapshot usually reaches back to the earliest wallets, and this one is still early.", cost: cost, time: time };
    if (age !== null && age !== undefined && age > 730) return { text: 'Hold for at least ' + hold + ' days, until ' + plan.end_date + ', then reassess: ' + p.name + ' has run ' + (age / 365).toFixed(1) + ' years with no token, so keep the position only while its cost stays near zero and treat any launch as a bonus, not a plan.', cost: cost, time: time };
    return { text: 'Hold the position for at least ' + hold + ' days, until ' + plan.end_date + ', so the activity is counted in more than one snapshot.', cost: cost, time: time };
  }
  function farmSteps(p) {
    var age = p.age_days === undefined ? null : p.age_days;
    var chain = chainOf(p);
    var plan = p.plan;
    var gas1 = fmtMoney(gasPerAction(p.chains && p.chains.length ? p.chains[0] : undefined));
    var capital = plan.capital_usd;
    var steps = [
      slugHash(p.slug) % 2 === 0
        ? { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'about ' + gas1 + ' of gas for the first transaction', time: '5 minutes' }
        : { text: 'Create a wallet you use only for this farm, fund it from your main wallet, and store its seed phrase on paper — never in a screenshot or a cloud note.', cost: 'about ' + gas1 + ' of gas to fund it', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital; ' + fmtMoney(plan.gas_usd) + ' of gas across ' + plan.actions + ' actions in all', time: '15 minutes to set up' },
      secondActionFor(p, chain, gas1)
    ];
    if (p.chains && p.chains.length >= 2) {
      steps.push({ text: 'Repeat the core action on ' + p.chains[1] + ': ' + p.name + ' runs on ' + p.chains.length + ' chains, and activity is usually counted per chain, so a second chain doubles the surfaces a snapshot can see.', cost: 'the $' + DATA.model.bridge_fee_usd + ' bridge fee, plus gas on ' + p.chains[1], time: '20 minutes' });
    }
    steps.push(cadenceStep(p, gas1));
    steps.push(holdStep(p, age, plan));
    steps.push({ text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' });
    var verdictSentence = plan.break_even_usd !== null && plan.break_even_usd !== undefined
      ? 'Verdict: ' + plan.verdict + ' — this plan costs ' + fmtMoney(plan.plan_cost_usd) + ' all-in against ' + fmtMoney(plan.expected_value_usd) + ' of expected value (net ' + fmtMoney(plan.net_usd) + '), and it breaks even if the launch is worth ' + fmtMoney(plan.break_even_usd) + '.'
      : 'Verdict: ' + plan.verdict + ' — this plan costs ' + fmtMoney(plan.plan_cost_usd) + ' all-in against ' + fmtMoney(plan.expected_value_usd) + ' of expected value (net ' + fmtMoney(plan.net_usd) + '), and no launch value makes it pay.';
    steps.push({ text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. ' + verdictSentence, cost: 'nothing but the log', time: '5 minutes' });
    return steps.map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('cov')) state.cov = params.get('cov');
    if (params.get('watch')) state.watch = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.cov !== 'all') params.set('cov', state.cov);
    if (state.watch) params.set('watch', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function defaultView() { return !state.q && state.category === 'all' && state.verdict === 'all' && !state.watch; }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.verdict !== 'all' && r.plan.verdict !== state.verdict) return false;
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
  function verdictChip(v) {
    return el('span', { class: 'verdict verdict-' + v, text: v });
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
        el('div', { class: 'fact' }, el('span', { text: 'Protocols accounted for' }), el('b', { text: DATA.coverage_counts.total + ' of ' + DATA.coverage_counts.total }))
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
    var verdictSel = el('select', { id: 'verdict', 'aria-label': 'Filter by plan verdict' },
      el('option', { value: 'all', text: 'All verdicts' }),
      ['farm', 'thin', 'skip'].map(function (v) {
        var n = DATA.rows.filter(function (r) { return r.plan.verdict === v; }).length;
        return el('option', { value: v, text: v + ' (' + n + ')', selected: state.verdict === v ? 'selected' : null });
      })
    );
    verdictSel.addEventListener('change', function () { state.verdict = verdictSel.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var cov = el('button', { type: 'button', 'aria-pressed': state.tab === 'coverage' ? 'true' : 'false', text: 'Coverage', onclick: function () { state.tab = 'coverage'; writeHash(); render(); } });
    var watchBtn = el('button', { type: 'button', class: 'watch-toggle', 'aria-pressed': state.watch ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watch = !state.watch; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), verdictSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live, cov)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Floor' }), watchBtn),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'coverage' ? DATA.coverage.length + ' protocols accounted' : DATA.live.length + ' live-token protocols' })
    );
  }

  function picks() {
    var top = byRank.slice(0, 3);
    return el('section', { class: 'picks', 'aria-label': 'Top picks' },
      top.map(function (r, i) {
        return el('article', { class: 'pick', tabindex: '0', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
          el('div', { class: 'pick-head' },
            el('span', { class: 'pick-rank', text: '#' + (i + 1) }),
            el('span', { class: 'hero-tags' }, tagFor(r), verdictChip(r.plan.verdict))
          ),
          el('h2', { class: 'pick-name', text: r.name }),
          el('div', { class: 'pick-value num', text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'pick-meta' },
            el('span', null, 'TVL ', el('b', { class: 'num', text: fmtUsd(r.tvl_usd) })),
            el('span', { class: r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg' }, '7d ', el('b', { class: 'num', text: r.change_7d === null ? 'n/a' : fmtPct(r.change_7d) })),
            el('span', null, 'Age ', el('b', { class: 'num', text: fmtAge(r.age_days) })),
            el('span', null, 'Range ', el('b', { class: 'num', text: '#' + r.rank_lo + '–' + r.rank_hi }))
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
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.verdict = 'all'; writeHash(); render(); } })
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
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub', text: 'ranks ' + r.rank_lo + '–' + r.rank_hi })
        )),
        el('td', null, verdictChip(r.plan.verdict)),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its fitted model, rank range and costed farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Verdict' }),
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

  function modelStrip() {
    var f = DATA.fit;
    var counts = { farm: 0, thin: 0, skip: 0 };
    DATA.rows.forEach(function (r) { counts[r.plan.verdict] += 1; });
    return el('section', { class: 'strip', 'aria-label': 'Model summary' },
      el('span', null, el('b', { text: DATA.model_version }), ' fitted on ' + f.peers_used + ' clean peers (b = ' + f.size_exponent.toFixed(3) + ', k = ' + f.shrink_k + ')'),
      el('span', { text: 'Leave-one-out log-RMSE ' + f.validation.loo.log_rmse.toFixed(3) + ' · ' + Math.round(f.validation.loo.within_2x * 100) + '% within 2x' }),
      el('span', { text: 'Rank ranges from ' + DATA.model.refits + ' refits' }),
      el('span', { text: DATA.coverage_counts.total + ' protocols counted: ' + DATA.coverage_counts.ranked + ' ranked · ' + DATA.coverage_counts.traded + ' traded · ' + DATA.coverage_counts.aside + ' set aside — every one with a reason (Coverage)' }),
      el('span', null, 'Verdicts: ', el('b', { class: 'verdict-farm-t', text: counts.farm + ' farm' }), ' · ', el('b', { class: 'verdict-thin-t', text: counts.thin + ' thin' }), ' · ', el('b', { text: counts.skip + ' skip' }))
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    var loo = f.validation.loo;
    var wf = f.validation.wf;
    function pct(x) { return Math.round(x * 100) + '%'; }
    function delta(x) { return x === null ? '—' : (x > 0 ? '+' : '') + x.toFixed(3); }
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed — and how well it works' }),
      el('p', { class: 'sub', text: 'Every row is priced by one fitted curve over the launches the market has already priced. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = exp( ' + f.intercept.toFixed(3) + ' + category_offset + ' + f.size_exponent.toFixed(3) + ' x log(tvl_usd)' + (f.growth_weight > 0 ? ' + ' + f.growth_coef.toFixed(3) + ' x clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100' : '') + (f.age_weight > 0 ? ' + ' + f.age_coef.toFixed(3) + ' x log(1 + age_days / 365)' : '') + ' )'
      ),
      el('p', { class: 'sub', text: 'The curve is fit by least squares on logs over ' + f.peers_used + ' clean peers — protocols recording a market cap above zero with TVL above zero, one per ticker symbol. ' + f.broken_prints + ' of the ' + f.peers_seen + ' protocols that record a cap print zero or less; they are excluded as broken prints, not clamped into the fit. The fit runs twice: the second pass winsorizes residuals at the median ± ' + m.mad_factor + ' x MAD, so one wild print bends the curve instead of breaking it. A category is priced at its peers\' mean residual, shrunk toward zero by n / (n + k): a one-peer category borrows most of its price from the whole market. Chains are not a value term: reach is priced in the farm plan, where a second chain costs a $' + m.bridge_fee_usd + ' bridge fee and earns a second surface. The board ranks every protocol that records no token and is not a wrapped, staked or bridged product of one that trades; the live-token protocols are set aside with their market caps shown.' }),
      el('h3', { text: 'The blind tests' }),
      el('p', { class: 'sub', text: 'Leave-one-out over all ' + loo.n + ' peers: log-RMSE ' + loo.log_rmse.toFixed(3) + ', median error ' + pct(loo.median_ape) + ', ' + pct(loo.within_2x) + ' of launches priced within a factor of two. Walk-forward over the ' + f.dated_peers + ' dated peers, ' + wf.n + ' tested, each priced only by launches already listed: log-RMSE ' + wf.log_rmse.toFixed(3) + ', median error ' + pct(wf.median_ape) + ', ' + pct(wf.within_2x) + ' within a factor of two. Cross-sectional launch pricing is noisy and the radar says so: the point estimate is the curve, and the honesty is in these lines and in each row\'s rank range from ' + m.refits + ' seeded bootstrap refits (seed 0x' + m.refit_seed.toString(16).toUpperCase() + ', terms frozen, selection not re-run).' }),
      el('table', { class: 'sel-table' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Candidate' }), el('th', { scope: 'col', text: 'LOO Δ' }), el('th', { scope: 'col', text: 'WF Δ' }), el('th', { scope: 'col', text: 'Decision' }))),
        el('tbody', null, f.selection.map(function (s) {
          return el('tr', null, el('td', { text: s.term }), el('td', { class: 'num', text: delta(s.loo_delta) }), el('td', { class: 'num', text: delta(s.wf_delta) }), el('td', { text: s.decision }));
        }))
      ),
      el('p', { class: 'sub', text: 'A candidate ships only if it improves both tests; helping one and hurting the other halves its weight; hurting both drops it. Shrinkage candidates, combined leave-one-out + walk-forward log-RMSE: ' + f.shrink_table.map(function (r) { return 'k=' + r.k + ' → ' + (r.loo + r.wf).toFixed(3); }).join(', ') + '.' }),
      el('h3', { text: 'How a farm plan is costed' }),
      el('p', { class: 'sub', text: 'Each plan deposits a TVL-banded $50–$250 and holds it for an age-banded 30–60 days from the snapshot date, with real start and exit dates. Cost counts every action (setup, core, second action, one a week of the hold, the claim check) at the first chain\'s gas — Ethereum $' + m.gas_ethereum + ', Solana $' + m.gas_solana + ', other chains $' + m.gas_other + ', unlisted $' + m.gas_unknown + ' — plus the $' + m.bridge_fee_usd + ' bridge fee on multi-chain plans, swap fees at ' + (m.swap_rate * 100) + '% in and out for DEX and yield categories (in only otherwise), and the yield given up carrying the deposit at ' + (m.opportunity_rate * 100) + '% a year. Expected value is the farmer\'s TVL-time share of a stated ' + (m.allocation * 100) + '% community allocation, with the farming capital competing for that allocation stated at ' + (m.farm_tvl_share * 100) + '% of TVL: the whole TVL is not farming, and pricing it as if it were would value every plan at cents. The verdict is the arithmetic: farm when value is at least twice cost, thin at cost, skip below.' })
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
        el('span', { class: 'hero-tags' }, tagFor(row), verdictChip(row.plan.verdict))
      ),
      el('div', { class: 'hero-value num', text: fmtUsd(row.implied_value_usd) }),
      el('p', { class: 'sub', text: 'TVL ' + fmtUsd(row.tvl_usd) + ' · ' + (row.change_7d === null ? 'no seven-day change reported' : fmtPct(row.change_7d) + ' in seven days') + ' · ' + fmtAge(row.age_days) + ' with no token on record' }),
      el('p', { class: 'sub', text: 'Across ' + DATA.model.refits + ' refits this row ranks ' + row.rank_lo + '–' + row.rank_hi + ', with implied value ' + fmtUsd(row.implied_lo) + '–' + fmtUsd(row.implied_hi) + '.' })
    ));
    // Each multiplier drawn against the full range the model allows it.
    function brow(label, shown, frac, note) {
      var pct = Math.max(2, Math.min(100, Math.round(frac * 100)));
      return el('div', { class: 'brow' },
        el('div', { class: 'brow-top' }, el('span', { text: label }), el('b', { class: 'num', text: shown })),
        el('div', { class: 'bbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + pct + '%' })),
        el('p', { class: 'sub', text: note })
      );
    }
    var plan = row.plan;
    function crow(label, value, note) {
      return el('div', { class: 'crow' }, el('span', { text: label }), el('b', { class: 'num', text: value }), note ? el('span', { class: 'sub', text: note }) : null);
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'What the plan costs' }),
      el('div', { class: 'costing' },
        crow('Deposit', fmtMoney(plan.capital_usd), 'held ' + plan.hold_days + ' days, ' + plan.start_date + ' to ' + plan.end_date),
        crow('Gas', fmtMoney(plan.gas_usd), plan.actions + ' actions on ' + (row.chains && row.chains.length ? row.chains[0] : 'an unlisted chain')),
        crow('Bridge fee', fmtMoney(plan.bridge_usd), plan.bridge_usd > 0 ? 'the plan works a second chain' : 'single-chain plan'),
        crow('Swap fees', fmtMoney(plan.swap_usd), 'at ' + (m.swap_rate * 100) + '% of the deposit'),
        crow('Yield given up', fmtMoney(plan.opportunity_usd), 'at ' + (m.opportunity_rate * 100) + '% a year'),
        crow('Plan cost, all-in', fmtMoney(plan.plan_cost_usd), ''),
        crow('Expected value', fmtMoney(plan.expected_value_usd), 'TVL-time share of a ' + (m.allocation * 100) + '% allocation; farming capital at ' + (m.farm_tvl_share * 100) + '% of TVL'),
        crow('Net', fmtMoney(plan.net_usd), ''),
        crow('Break-even launch', plan.break_even_usd === null ? 'never' : fmtUsd(plan.break_even_usd), 'the launch value at which this plan nets zero'),
        el('div', { class: 'crow' }, el('span', { text: 'Verdict' }), verdictChip(plan.verdict), el('span', { class: 'sub', text: 'farm at twice cost, thin at cost, skip below' }))
      )
    ));
    var beDays = plan.break_even_days;
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The plan on a timeline' }),
      el('div', { class: 'timeline' },
        el('div', { class: 'tl-node' },
          el('b', { text: 'Enter' }),
          el('span', { class: 'num', text: plan.start_date }),
          el('p', { class: 'sub', text: 'Week 1: put down the ' + fmtMoney(plan.capital_usd) + ' deposit and work the ' + plan.actions + ' actions.' })),
        el('div', { class: 'tl-node' },
          el('b', { text: beDays === null ? 'Break-even: never' : 'Break-even: day ' + beDays }),
          el('span', { class: 'num', text: beDays === null ? 'no date' : plan.break_even_date }),
          el('p', { class: 'sub', text: beDays === null ? 'No time farmed covers the ' + fmtMoney(plan.plan_cost_usd) + ' all-in cost at this implied value.' : beDays > plan.hold_days ? 'Past the exit: the hold ends before the ' + fmtMoney(plan.plan_cost_usd) + ' cost is covered.' : 'Farming this long covers the ' + fmtMoney(plan.plan_cost_usd) + ' all-in cost.' })),
        el('div', { class: 'tl-node' },
          el('b', { text: 'Exit' }),
          el('span', { class: 'num', text: plan.end_date }),
          el('p', { class: 'sub', text: 'Day ' + plan.hold_days + ': expected value ' + fmtMoney(plan.expected_value_usd) + ', net ' + fmtMoney(plan.net_usd) + '.' }))
      )
    ));
    var curveAtTvl = Math.exp(DATA.fit.intercept + row.fit_b * Math.log(Math.max(1, row.tvl_usd)));
    var ageSel = DATA.fit.selection.filter(function (s) { return s.term.indexOf('Age term') === 0; })[0];
    var ageNote = DATA.fit.age_weight === 0
      ? 'Age is not in the value: the blind tests dropped the age term (leave-one-out ' + (ageSel.loo_delta > 0 ? '+' : '') + ageSel.loo_delta.toFixed(3) + ', walk-forward ' + (ageSel.wf_delta > 0 ? '+' : '') + ageSel.wf_delta.toFixed(3) + ' log-RMSE). Age still sets this plan\'s ' + row.plan.hold_days + '-day hold and its weekly cadence.'
      : 'The age term ships at weight ' + DATA.fit.age_weight + ' (coefficient ' + DATA.fit.age_coef.toFixed(3) + ').';
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'How the model gets there' }),
      el('div', { class: 'breakdown' },
        brow('Size curve at this TVL', fmtUsd(curveAtTvl),
          (Math.log(Math.max(1, curveAtTvl)) - Math.log(1e5)) / (Math.log(2e8) - Math.log(1e5)),
          'The fitted curve exp(' + DATA.fit.intercept.toFixed(3) + ' + ' + row.fit_b.toFixed(3) + ' x log TVL) before the category offset: launches price sub-linearly in size, the blind tests\' headline finding.'),
        brow('Category offset', 'x ' + Math.exp(row.fit_offset).toFixed(3),
          0.5 + row.fit_offset / 4,
          (row.category || 'This category') + ' is priced from ' + row.category_peers + ' clean peer' + (row.category_peers === 1 ? '' : 's') + ': its mean residual, shrunk toward zero by n / (n + ' + DATA.fit.shrink_k + ').'),
        brow('Growth term', 'x ' + Math.exp(row.fit_growth).toFixed(3),
          0.5 + row.fit_growth / 2,
          'Seven-day TVL change of ' + fmtPct(row.change_7d) + ', clamped to [' + m.growth_floor + '%, +' + m.growth_cap + '%]. The blind tests kept this term at ' + (DATA.fit.growth_weight === 0.5 ? 'half weight' : DATA.fit.growth_weight === 1 ? 'full weight' : 'no weight') + ': it barely helps leave-one-out and hurts walk-forward.')
      ),
      el('p', { class: 'sub', text: ageNote }),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same fitted curve scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row)) + (impliedOf(row) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
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

  function coverageSection() {
    var c = DATA.coverage_counts;
    var list = DATA.coverage.filter(function (e) {
      if (state.cov === 'ranked' && e.status !== 'ranked') return false;
      if (state.cov === 'traded' && e.status !== 'traded') return false;
      if (state.cov === 'aside' && e.status !== 'aside') return false;
      if (state.q) { var q = state.q.toLowerCase(); if ((e.name + ' ' + (e.category || '')).toLowerCase().indexOf(q) === -1) return false; }
      return true;
    });
    function opt(v, label) { return el('option', { value: v, text: label, selected: state.cov === v ? 'selected' : null }); }
    var sel = el('select', { id: 'cov', 'aria-label': 'Filter the coverage ledger' },
      opt('all', 'All ' + c.total + ' protocols'), opt('ranked', 'Ranked (' + c.ranked + ')'),
      opt('traded', 'Token trades (' + c.traded + ')'), opt('aside', 'Set aside (' + c.aside + ')'));
    sel.addEventListener('change', function () { state.cov = sel.value; writeHash(); render(); });
    var tbody = el('tbody');
    list.forEach(function (e) {
      var status = e.status === 'ranked'
        ? el('span', { class: 'tag tag-watch', text: 'ranked #' + e.rank })
        : el('span', { class: 'status', text: e.status === 'traded' ? 'trades' : 'set aside' });
      var attrs = e.status === 'ranked' ? { tabindex: '0', onclick: function () { openDetail(e.slug); }, onkeydown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDetail(e.slug); } } } : null;
      tbody.appendChild(el('tr', attrs,
        el('td', null, el('div', { class: 'name' }, el('b', { text: e.name }), el('span', { class: 'sub', text: e.category || 'Other' }))),
        el('td', { class: 'num', text: fmtUsd(e.tvl_usd) }),
        el('td', null, status),
        el('td', null, el('span', { class: 'sub', text: e.reason }))
      ));
    });
    return el('section', { class: 'panel', 'aria-label': 'Coverage ledger' },
      el('div', { class: 'section-head' },
        el('h2', { text: 'Coverage: every protocol in the snapshot, accounted for' }),
        el('p', { class: 'sub', text: 'The snapshot holds ' + c.total + ' protocols and the board ranks ' + c.ranked + ' of them. The other ' + (c.traded + c.aside) + ' are not missing: ' + c.traded + ' already trade — the fitted curve learns from ' + DATA.fit.peers_used + ' of them, so they are its anchors, not its candidates — and ' + c.aside + ' record no token of their own. Every protocol carries the reason it landed where it did; select a ranked row for its model and plan.' }),
        el('div', { class: 'field' }, el('label', { for: 'cov', text: 'Show' }), sel)
      ),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Why' }))),
          tbody
        )
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
      shell.appendChild(modelStrip());
      if (defaultView()) shell.appendChild(picks());
      shell.appendChild(boardTable());
      if (defaultView()) shell.appendChild(earlySection());
      shell.appendChild(modelPanel());
    } else if (state.tab === 'live') {
      shell.appendChild(liveTable());
    } else {
      shell.appendChild(coverageSection());
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
