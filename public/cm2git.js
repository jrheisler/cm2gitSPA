document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  let allActivities = [];
  let theme = localStorage.getItem('cm2git-theme');
  if (!theme) {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    localStorage.setItem('cm2git-theme', theme);
  }
  let themeButton;

  function updateTheme() {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('cm2git-theme', theme);
    if (themeButton) {
      themeButton.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
    }
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    updateTheme();
  }

  updateTheme();

  function createSelect(options) {
    const select = document.createElement('select');
    options.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    });
    return select;
  }

  function createInput(key, placeholder, type = 'text') {
    const input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.value = localStorage.getItem(key) || '';
    input.addEventListener('input', () => {
      localStorage.setItem(key, input.value);
    });
    return input;
  }

  async function loadActivity(owner, repo, token) {
    const headers = { Authorization: `token ${token}` };
    try {
      const [pullRes, commitRes, eventRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all`, {
          headers,
        }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/commits`, {
          headers,
        }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/events`, {
          headers,
        }),
      ]);

      const [pulls, commits, events] = await Promise.all([
        pullRes.json(),
        commitRes.json(),
        eventRes.json(),
      ]);

      await Promise.all(
        commits.map(async (c) => {
          try {
            const res = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/commits/${c.sha}/pulls`,
              {
                headers: {
                  ...headers,
                  Accept: 'application/vnd.github.groot-preview+json',
                },
              }
            );
            const prs = await res.json();
            if (Array.isArray(prs) && prs.length > 0) {
              c.pr = { number: prs[0].number, url: prs[0].html_url };
            }
          } catch (e) {
            // ignore
          }
        })
      );

      const activities = [
        ...pulls.map((pr) => ({
          type: 'PR',
          id: pr.id,
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          date: pr.created_at,
          author: pr.user?.login || 'unknown',
        })),
        ...commits.map((c) => ({
          type: 'commit',
          id: c.sha,
          title: c.commit.message.split('\n')[0],
          url: c.html_url,
          date: c.commit.author?.date || c.commit.committer?.date,
          author:
            c.author?.login ||
            c.commit.author?.name ||
            c.commit.committer?.name ||
            'unknown',
          pr: c.pr,
        })),
        ...events
          .filter(
            (e) =>
              e.type === 'PullRequestEvent' &&
              e.payload?.pull_request?.merged
          )
          .map((e) => ({
            type: 'merge',
            id: e.id,
            title: e.payload.pull_request.title,
            url: `https://github.com/${owner}/${repo}/commit/${e.payload.pull_request.merge_commit_sha}`,
            date: e.created_at,
            author:
              e.actor?.login ||
              e.payload.pull_request.user?.login ||
              'unknown',
            mergeCommitSha: e.payload.pull_request.merge_commit_sha,
            prNumber: e.payload.pull_request.number,
            prUrl: e.payload.pull_request.html_url,
          })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      console.log('Activity loaded', activities);
      return activities;
    } catch (err) {
      console.error('Failed to load activity', err);
      return [];
    }
  }

  function groupActivities(activities) {
    const prs = new Map();
    const others = [];

    activities
      .filter((a) => a.type === 'PR')
      .forEach((a) => {
        prs.set(a.number, { ...a, commits: [], merge: null });
      });

    activities.forEach((a) => {
      if (a.type === 'commit' && a.pr) {
        const pr = prs.get(a.pr.number);
        if (pr) {
          pr.commits.push(a);
        } else {
          others.push(a);
        }
      } else if (a.type === 'merge' && a.prNumber) {
        const pr = prs.get(a.prNumber);
        if (pr) {
          pr.merge = a;
        } else {
          others.push(a);
        }
      } else if (a.type !== 'PR') {
        others.push(a);
      }
    });

    prs.forEach((pr) => {
      const dates = [new Date(pr.date), ...pr.commits.map((c) => new Date(c.date))];
      if (pr.merge) {
        dates.push(new Date(pr.merge.date));
      }
      pr.date = new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString();
    });

    return [...prs.values(), ...others];
  }

  function createActivityItem(activity, isSub = false) {
    const item = document.createElement('div');
    item.className = isSub ? 'activity-item sub-activity' : 'activity-item';

    const type = document.createElement('div');
    type.className = 'activity-type';
    type.textContent = activity.type;

    const title = document.createElement('a');
    title.className = 'activity-title';
    title.href = activity.url;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
    title.textContent = activity.title;

    const author = document.createElement('div');
    author.className = 'activity-author';
    author.textContent = activity.author;

    const date = document.createElement('div');
    date.className = 'activity-date';
    date.textContent = new Date(activity.date).toLocaleString();

    item.append(type, title);

    if (activity.type === 'commit' && activity.pr && !isSub) {
      const prLink = document.createElement('a');
      prLink.href = activity.pr.url;
      prLink.target = '_blank';
      prLink.rel = 'noopener noreferrer';
      prLink.textContent = `PR #${activity.pr.number}`;
      item.appendChild(prLink);
    }

    if (activity.type === 'merge') {
      if (activity.mergeCommitSha) {
        const commitLink = document.createElement('a');
        commitLink.href = activity.url;
        commitLink.target = '_blank';
        commitLink.rel = 'noopener noreferrer';
        commitLink.textContent = activity.mergeCommitSha.slice(0, 7);
        item.appendChild(commitLink);
      }
      if (activity.prNumber && activity.prUrl && !isSub) {
        const prLink = document.createElement('a');
        prLink.href = activity.prUrl;
        prLink.target = '_blank';
        prLink.rel = 'noopener noreferrer';
        prLink.textContent = `PR #${activity.prNumber}`;
        item.appendChild(prLink);
      }
    }

    item.append(author, date);
    return item;
  }

  function renderActivities(activities, container) {
    container.innerHTML = '';
    activities.forEach((activity) => {
      if (activity.type === 'PR') {
        const group = document.createElement('div');
        group.className = 'pr-group';

        const header = createActivityItem(activity);
        header.classList.add('pr-header');
        group.appendChild(header);

        const details = document.createElement('div');
        details.className = 'pr-details';

        activity.commits.forEach((c) => {
          details.appendChild(createActivityItem(c, true));
        });

        if (activity.merge) {
          details.appendChild(createActivityItem(activity.merge, true));
        }

        group.appendChild(details);

        header.addEventListener('click', () => {
          group.classList.toggle('open');
        });

        container.appendChild(group);
      } else {
        container.appendChild(createActivityItem(activity));
      }
    });
  }

  function renderGridActivities(activities, container) {
    container.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'activity-grid';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Type', 'Title/PR', 'Author', 'Date'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    function createCell(content) {
      const td = document.createElement('td');
      if (content instanceof Node) {
        td.appendChild(content);
      } else {
        td.textContent = content;
      }
      return td;
    }

    activities.forEach((activity) => {
      if (activity.type === 'PR') {
        const header = document.createElement('tr');
        header.className = 'pr-header';
        const titleLink = document.createElement('a');
        titleLink.href = activity.url;
        titleLink.target = '_blank';
        titleLink.rel = 'noopener noreferrer';
        titleLink.textContent = activity.title;
        header.append(
          createCell(activity.type),
          createCell(titleLink),
          createCell(activity.author),
          createCell(new Date(activity.date).toLocaleString())
        );
        tbody.appendChild(header);

        const subRows = [];
        activity.commits.forEach((c) => {
          const row = document.createElement('tr');
          row.className = 'sub-activity';
          row.style.display = 'none';

          const link = document.createElement('a');
          link.href = c.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = c.title;
          if (c.pr) {
            const prLink = document.createElement('a');
            prLink.href = c.pr.url;
            prLink.target = '_blank';
            prLink.rel = 'noopener noreferrer';
            prLink.textContent = `PR #${c.pr.number}`;
            link.appendChild(document.createTextNode(' '));
            link.appendChild(prLink);
          }
          row.append(
            createCell(c.type),
            createCell(link),
            createCell(c.author),
            createCell(new Date(c.date).toLocaleString())
          );
          tbody.appendChild(row);
          subRows.push(row);
        });

        if (activity.merge) {
          const m = activity.merge;
          const row = document.createElement('tr');
          row.className = 'sub-activity';
          row.style.display = 'none';

          const link = document.createElement('a');
          link.href = m.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = m.title;
          if (m.prNumber && m.prUrl) {
            const prLink = document.createElement('a');
            prLink.href = m.prUrl;
            prLink.target = '_blank';
            prLink.rel = 'noopener noreferrer';
            prLink.textContent = `PR #${m.prNumber}`;
            link.appendChild(document.createTextNode(' '));
            link.appendChild(prLink);
          }
          row.append(
            createCell(m.type),
            createCell(link),
            createCell(m.author),
            createCell(new Date(m.date).toLocaleString())
          );
          tbody.appendChild(row);
          subRows.push(row);
        }

        header.addEventListener('click', () => {
          const hidden = subRows[0] && subRows[0].style.display === 'none';
          subRows.forEach((r) => {
            r.style.display = hidden ? '' : 'none';
          });
        });
      } else {
        const row = document.createElement('tr');
        const link = document.createElement('a');
        link.href = activity.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = activity.title;
        row.append(
          createCell(activity.type),
          createCell(link),
          createCell(activity.author),
          createCell(new Date(activity.date).toLocaleString())
        );
        tbody.appendChild(row);
      }
    });

    container.appendChild(table);
  }

  function bootstrap() {
    const ownerInput = createInput('cm2git-owner', 'Owner');
    const repoInput = createInput('cm2git-repo', 'Repo');
    const tokenInput = createInput('cm2git-token', 'Personal Access Token', 'password');

    const filterSelect = createSelect([
      { value: 'all', label: 'All' },
      { value: 'PR', label: 'PR' },
      { value: 'commit', label: 'Commit' },
      { value: 'merge', label: 'Merge' },
    ]);

    const sortSelect = createSelect([
      { value: 'desc', label: 'Newest First' },
      { value: 'asc', label: 'Oldest First' },
    ]);

    const viewSelect = createSelect([
      { value: 'card', label: 'Card' },
      { value: 'grid', label: 'Grid' },
    ]);
    viewSelect.value = localStorage.getItem('cm2git-view') || 'card';

    themeButton = document.createElement('button');
    themeButton.addEventListener('click', toggleTheme);
    updateTheme();

    const button = document.createElement('button');
    button.textContent = 'Load Activity';
    const activityContainer = document.createElement('div');
    activityContainer.id = 'activity';
    activityContainer.style.display = 'block';

    function applyAndRender() {
      let filtered = [...allActivities];
      const type = filterSelect.value;
      if (type !== 'all') {
        filtered = filtered.filter((a) =>
          type === 'merge' ? a.merge : a.type === type
        );
      }
      filtered.sort((a, b) =>
        sortSelect.value === 'asc'
          ? new Date(a.date) - new Date(b.date)
          : new Date(b.date) - new Date(a.date)
      );
      const view = viewSelect.value;
      localStorage.setItem('cm2git-view', view);
      activityContainer.classList.toggle('grid', view === 'grid');
      if (view === 'grid') {
        renderGridActivities(filtered, activityContainer);
      } else {
        renderActivities(filtered, activityContainer);
      }
    }

    filterSelect.addEventListener('change', applyAndRender);
    sortSelect.addEventListener('change', applyAndRender);
    viewSelect.addEventListener('change', () => {
      localStorage.setItem('cm2git-view', viewSelect.value);
      applyAndRender();
    });

    button.addEventListener('click', async () => {
      const owner = ownerInput.value.trim();
      const repo = repoInput.value.trim();
      const token = tokenInput.value.trim();
      if (!owner || !repo || !token) {
        console.warn('Owner, repo, and token are required');
        return;
      }
      const loaded = await loadActivity(owner, repo, token);
      allActivities = groupActivities(loaded);
      applyAndRender();
    });

    app.appendChild(ownerInput);
    app.appendChild(repoInput);
    app.appendChild(tokenInput);
    app.appendChild(filterSelect);
    app.appendChild(sortSelect);
    app.appendChild(viewSelect);
    app.appendChild(themeButton);
    app.appendChild(button);
    app.appendChild(activityContainer);
  }

  if (app) {
    bootstrap();
  }
});
