document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  let allActivities = [];

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
            url: e.payload.pull_request.html_url,
            date: e.created_at,
            author:
              e.actor?.login ||
              e.payload.pull_request.user?.login ||
              'unknown',
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
      const item = document.createElement('a');
      item.className = 'activity-item';
      item.href = activity.url;
      item.target = '_blank';
      item.rel = 'noopener noreferrer';

      const type = document.createElement('div');
      type.className = 'activity-type';
      type.textContent = activity.type;

      const title = document.createElement('div');
      title.className = 'activity-title';
      title.textContent = activity.title;

      const author = document.createElement('div');
      author.className = 'activity-author';
      author.textContent = activity.author;

      const date = document.createElement('div');
      date.className = 'activity-date';
      date.textContent = new Date(activity.date).toLocaleString();

      item.append(type, title, author, date);
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
    app.appendChild(button);
    app.appendChild(activityContainer);
  }

  if (app) {
    bootstrap();
  }
});
