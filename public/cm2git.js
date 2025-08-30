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

  function renderActivities(activities, container) {
    container.innerHTML = '';
    activities.forEach((activity) => {
      const item = document.createElement('div');
      item.className = 'activity-item';

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

      if (activity.type === 'commit' && activity.pr) {
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
        if (activity.prNumber && activity.prUrl) {
          const prLink = document.createElement('a');
          prLink.href = activity.prUrl;
          prLink.target = '_blank';
          prLink.rel = 'noopener noreferrer';
          prLink.textContent = `PR #${activity.prNumber}`;
          item.appendChild(prLink);
        }
      }

      item.append(author, date);
      container.appendChild(item);
    });
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

    themeButton = document.createElement('button');
    themeButton.addEventListener('click', toggleTheme);
    updateTheme();

    const button = document.createElement('button');
    button.textContent = 'Load Activity';
    const activityContainer = document.createElement('div');
    activityContainer.id = 'activity';

    function applyAndRender() {
      let filtered = [...allActivities];
      const type = filterSelect.value;
      if (type !== 'all') {
        filtered = filtered.filter((a) => a.type === type);
      }
      filtered.sort((a, b) =>
        sortSelect.value === 'asc'
          ? new Date(a.date) - new Date(b.date)
          : new Date(b.date) - new Date(a.date)
      );
      renderActivities(filtered, activityContainer);
    }

    filterSelect.addEventListener('change', applyAndRender);
    sortSelect.addEventListener('change', applyAndRender);

    button.addEventListener('click', async () => {
      const owner = ownerInput.value.trim();
      const repo = repoInput.value.trim();
      const token = tokenInput.value.trim();
      if (!owner || !repo || !token) {
        console.warn('Owner, repo, and token are required');
        return;
      }
      allActivities = await loadActivity(owner, repo, token);
      applyAndRender();
    });

    app.appendChild(ownerInput);
    app.appendChild(repoInput);
    app.appendChild(tokenInput);
    app.appendChild(filterSelect);
    app.appendChild(sortSelect);
    app.appendChild(themeButton);
    app.appendChild(button);
    app.appendChild(activityContainer);
  }

  if (app) {
    bootstrap();
  }
});
