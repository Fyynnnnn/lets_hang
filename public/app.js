const eventForm = document.getElementById('organizerForm');
const resultCard = document.getElementById('resultCard');
const eventCodeText = document.getElementById('eventCodeText');
const eventInviteLink = document.getElementById('eventInviteLink');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const openInvitePage = document.getElementById('openInvitePage');
const shareBox = document.getElementById('shareBox');
const shareEventCode = document.getElementById('shareEventCode');
const shareInviteLink = document.getElementById('shareInviteLink');
const copyShareCodeBtn = document.getElementById('copyShareCodeBtn');
const copyShareLinkBtn = document.getElementById('copyShareLinkBtn');

async function copyText(text, button, successText) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = button.textContent;
    button.textContent = successText;
    setTimeout(() => { button.textContent = originalText; }, 1500);
  } catch (error) {
    button.textContent = '複製失敗';
  }
}
const deleteEventBtn = document.getElementById('deleteEventBtn');

document.querySelectorAll('[data-back]').forEach((button) => {
  button.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/workspace';
    }
  });
});

if (document.body.classList.contains('gateway-page')) {
  fetch('/api/auth/session')
    .then((response) => { window.location.href = response.ok ? '/workspace' : '/login'; })
    .catch(() => { window.location.href = '/login'; });
}

const locationSearch = document.getElementById('locationSearch');
const locationAddress = document.getElementById('address');
const locationLatitude = document.getElementById('latitude');
const locationLongitude = document.getElementById('longitude');
const locationHint = document.getElementById('locationHint');
const locationSuggestions = document.getElementById('locationSuggestions');

function setLocationValue(name, address, latitude = '', longitude = '') {
  if (locationSearch) locationSearch.value = name || address || '';
  if (locationAddress) locationAddress.value = address || name || '';
  if (locationLatitude) locationLatitude.value = latitude;
  if (locationLongitude) locationLongitude.value = longitude;
}

if (locationSearch) {
  let searchTimer;
  locationSearch.addEventListener('input', () => {
    if (locationAddress && locationAddress.value !== locationSearch.value) {
      locationAddress.value = '';
    }
    if (locationLatitude) locationLatitude.value = '';
    if (locationLongitude) locationLongitude.value = '';
    clearTimeout(searchTimer);
    const query = locationSearch.value.trim();
    if (query.length < 2 || !locationSuggestions) {
      locationSuggestions?.classList.add('hidden');
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        locationSuggestions.innerHTML = data.places.length
          ? data.places.map((place) => `<button type="button" class="place-suggestion" data-name="${encodeURIComponent(place.name)}" data-address="${encodeURIComponent(place.address)}" data-lat="${place.latitude}" data-lng="${place.longitude}"><strong>${place.name}</strong><small>${place.address}</small></button>`).join('')
          : '<div class="place-empty">找不到建議，可直接使用目前輸入內容。</div>';
        locationSuggestions.classList.remove('hidden');
        locationSuggestions.querySelectorAll('.place-suggestion').forEach((button) => {
          button.addEventListener('click', () => {
            setLocationValue(decodeURIComponent(button.dataset.name), decodeURIComponent(button.dataset.address), button.dataset.lat, button.dataset.lng);
            locationSuggestions.classList.add('hidden');
            if (locationHint) locationHint.textContent = `已選取：${decodeURIComponent(button.dataset.address)}`;
          });
        });
      } catch (error) {
        locationSuggestions.classList.add('hidden');
      }
    }, 350);
  });
  if (locationHint) locationHint.textContent = '可直接輸入地點或地址，也可以從搜尋結果中選取。';
}

if (eventForm) {
  fetch('/api/auth/session')
    .then((response) => {
      if (!response.ok) throw new Error('未登入');
      return response.json();
    })
    .then((data) => {
      const organizerName = document.getElementById('organizerName');
      if (organizerName && !organizerName.value) organizerName.value = data.user.nickname || data.user.fullName;
    })
    .catch(() => { window.location.href = '/login'; });

  const queryParams = new URLSearchParams(window.location.search);
  const editSlug = queryParams.get('edit');
  const repeatSlug = queryParams.get('repeat');
  const submitButton = eventForm.querySelector('button[type="submit"]');
  const sourceSlug = editSlug || repeatSlug;
  const startDateInput = document.getElementById('date');
  const endDateInput = document.getElementById('endDate');
  const startTimeInput = document.getElementById('startTime');
  const endTimeInput = document.getElementById('endTime');
  const eventTimeHint = document.getElementById('eventTimeHint');
  const validateTimeFields = () => {
    if (!startDateInput || !endDateInput) return true;
    if (startDateInput.value && !endDateInput.value) endDateInput.value = startDateInput.value;
    const invalidDate = endDateInput.value < startDateInput.value;
    const invalidTime = endDateInput.value === startDateInput.value
      && startTimeInput?.value && endTimeInput?.value && endTimeInput.value < startTimeInput.value;
    endDateInput.setCustomValidity(invalidDate ? '結束日期不能早於開始日期。' : invalidTime ? '同日活動的結束時間不能早於開始時間。' : '');
    if (eventTimeHint) eventTimeHint.textContent = invalidDate || invalidTime
      ? (invalidDate ? '結束日期不能早於開始日期。' : '同日活動的結束時間不能早於開始時間。')
      : '同日活動的結束時間不能早於開始時間；跨日活動可選不同的結束日期。';
    return !invalidDate && !invalidTime;
  };
  [startDateInput, endDateInput, startTimeInput, endTimeInput].forEach((input) => input?.addEventListener('input', validateTimeFields));
  if (deleteEventBtn && editSlug) {
    deleteEventBtn.classList.remove('hidden');
    deleteEventBtn.addEventListener('click', async () => {
      const confirmed = window.confirm('確定要刪除這個活動嗎？刪除後活動碼與邀請連結將失效。');
      if (!confirmed) return;

      deleteEventBtn.disabled = true;
      deleteEventBtn.textContent = '刪除中...';
      try {
        const response = await fetch(`/api/events/${editSlug}`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(10000)
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || '刪除失敗');
        }
        window.location.href = '/workspace';
      } catch (error) {
        deleteEventBtn.disabled = false;
        deleteEventBtn.textContent = '刪除活動';
        alert(error.message || '刪除失敗，請確認伺服器正在執行。');
      }
    });
  }
  if (sourceSlug) {
    fetch(`/api/events/${sourceSlug}`)
      .then((response) => response.json())
      .then(({ event }) => {
        ['organizerName', 'title', 'summary', 'date', 'endDate', 'startTime', 'endTime', 'location', 'address', 'latitude', 'longitude', 'notes'].forEach((field) => {
          const input = document.getElementById(field);
          if (input && event[field] !== undefined) input.value = event[field];
        });
        if (repeatSlug) {
          const dateInput = document.getElementById('date');
          if (dateInput) dateInput.value = '';
          if (endDateInput) endDateInput.value = '';
          const heading = document.querySelector('.section-heading h1');
          const eyebrow = document.querySelector('.section-heading .eyebrow');
          if (heading) heading.textContent = '再次建立活動';
          if (eyebrow) eyebrow.textContent = '複製既有活動';
          if (submitButton) submitButton.textContent = '建立新的活動';
        } else if (submitButton) {
          submitButton.textContent = '儲存活動變更並通知參加者';
        }
      });
  }

  eventForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateTimeFields() || !eventForm.reportValidity()) return;
    const formData = new FormData(eventForm);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch(editSlug ? `/api/events/${editSlug}` : '/api/events', {
        method: editSlug ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        alert(result.message || '建立邀約失敗');
        return;
      }

      const code = result.code || result.event.code;
      eventCodeText.textContent = code;
      eventInviteLink.value = `${window.location.origin}/invite?code=${code}`;
      resultCard.classList.remove('hidden');
      if (editSlug && result.notificationCount !== undefined) {
        resultCard.querySelector('p').textContent = `活動已更新，已建立 ${result.notificationCount} 筆參加者通知。`;
      }
      openInvitePage.href = `/invite?code=${code}`;

      if (copyCodeBtn) {
        copyCodeBtn.textContent = '複製活動碼';
      }
    } catch (error) {
      alert('建立邀約時發生錯誤，請稍後再試。');
    }
  });
}

if (copyCodeBtn) {
  copyCodeBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(eventCodeText.textContent);
      copyCodeBtn.textContent = '已複製';
      setTimeout(() => {
        copyCodeBtn.textContent = '複製';
      }, 1500);
    } catch (error) {
      copyCodeBtn.textContent = '複製失敗';
    }
  });
}

if (copyLinkBtn) {
  copyLinkBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(eventInviteLink.value);
      copyLinkBtn.textContent = '已複製';
      setTimeout(() => {
        copyLinkBtn.textContent = '複製連結';
      }, 1500);
    } catch (error) {
      copyLinkBtn.textContent = '複製失敗';
    }
  });
}

const joinForm = document.getElementById('joinForm');
const joinError = document.getElementById('joinError');

if (joinForm) {
  fetch('/api/auth/session')
    .then((response) => {
      if (!response.ok) throw new Error('未登入');
      return response.json();
    })
    .then((data) => {
      const guestName = document.getElementById('guestName');
      if (guestName && !guestName.value) guestName.value = data.user.nickname || data.user.fullName;
    })
    .catch(() => { window.location.href = '/login'; });

  joinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = document.getElementById('eventCode').value.trim().toUpperCase();
    const guestName = document.getElementById('guestName').value.trim();

    if (!code || !guestName) {
      alert('請填寫活動碼與姓名');
      return;
    }

    try {
      const response = await fetch(`/api/events/code/${code}`);
      const result = await response.json();

      if (!response.ok || !result.event) {
        joinError.classList.remove('hidden');
        return;
      }

      joinError.classList.add('hidden');
      localStorage.setItem('party_current_code', code);
      localStorage.setItem('party_current_name', guestName);
      window.location.href = `/invite?code=${code}`;
    } catch (error) {
      joinError.classList.remove('hidden');
    }
  });
}

const tabButtons = document.querySelectorAll('.tab-btn');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authMessage = document.getElementById('authMessage');
const savedEmailKey = 'partylink_saved_emails';
const savedEmailsList = document.getElementById('savedEmails');

function getSavedEmails() {
  try {
    const emails = JSON.parse(localStorage.getItem(savedEmailKey) || '[]');
    return Array.isArray(emails) ? emails : [];
  } catch (error) {
    return [];
  }
}

function rememberEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return;
  const emails = [normalizedEmail, ...getSavedEmails().filter((item) => item !== normalizedEmail)].slice(0, 8);
  localStorage.setItem(savedEmailKey, JSON.stringify(emails));
  renderSavedEmails();
}

function renderSavedEmails() {
  if (!savedEmailsList) return;
  savedEmailsList.innerHTML = getSavedEmails()
    .map((email) => `<option value="${email}"></option>`)
    .join('');
}

renderSavedEmails();

if (tabButtons.length) {
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      tabButtons.forEach((item) => item.classList.toggle('active', item === button));
      const mode = button.dataset.auth;
      if (mode === 'register') {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
      } else {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
      }
    });
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const result = await response.json();

    if (!response.ok) {
      authMessage.textContent = result.message || '登入失敗';
      authMessage.classList.remove('hidden');
      return;
    }

    rememberEmail(email);
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.href = next || '/workspace';
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fullName = document.getElementById('registerName').value.trim();
    const nickname = document.getElementById('registerNickname').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, nickname, email, password })
    });
    const result = await response.json();

    if (!response.ok) {
      authMessage.textContent = result.message || '註冊失敗';
      authMessage.classList.remove('hidden');
      return;
    }

    rememberEmail(email);
    authMessage.textContent = '註冊成功，正在帶您進入活動工作台';
    authMessage.classList.remove('hidden');
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.href = next || '/workspace';
  });
}


const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });
}

const adminList = document.getElementById('eventList');
if (adminList) {
  fetch('/api/admin/events')
    .then((res) => {
      if (!res.ok) {
        throw new Error('未登入');
      }
      return res.json();
    })
    .then((data) => {
      if (!data.events || !data.events.length) {
        adminList.innerHTML = '<div class="empty-state">尚未建立任何活動。</div>';
        return;
      }

      adminList.innerHTML = data.events.map((event) => `
        <div class="event-item">
          <div class="event-head">
            <div>
              <h3>${event.title}</h3>
              <p>${event.date} • ${event.location}</p>
            </div>
            <span class="event-code">${event.code}</span>
          </div>
          <p class="event-summary">${event.summary}</p>
          <div class="mini-meta">
            <span>參加者：${(event.participants || []).length}</span>
            <span>邀請範圍：${event.inviteScope || '未設定'}</span>
          </div>
        </div>
      `).join('');
    })
    .catch(() => {
      window.location.href = '/login';
    });
}

const workspaceGreeting = document.getElementById('workspaceGreeting');
const workspaceLists = {
  current: document.getElementById('currentList'),
  past: document.getElementById('pastList')
};
const notificationBell = document.getElementById('notificationBell');
const notificationDot = document.getElementById('notificationDot');
const notificationPopover = document.getElementById('notificationPopover');

function renderDashboardEvents(target, events, emptyText) {
  if (!target) return;
  if (!events.length) {
    target.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }
  target.innerHTML = events.map((event) => `
    <article class="event-item role-${event.role}" data-event-url="/invite?code=${event.code}" tabindex="0" role="link" aria-label="查看活動：${event.title}">
      <div class="role-label">${event.role === 'host' ? '主辦' : '受邀'}</div>
      <div class="event-head"><div><h3>${event.title}</h3><p>${event.date}${event.endDate && event.endDate !== event.date ? ` - ${event.endDate}` : ''} · ${event.startTime || '時間未設定'}${event.endTime ? ` - ${event.endTime}` : ''}</p><p class="event-location-line">${event.location}</p></div><button type="button" class="event-code event-code-btn" data-code="${event.code}" title="複製活動碼">${event.code}</button></div>
      <p class="event-summary">${event.summary}</p>
      <div class="mini-meta"><span>參加人數：${(event.participants || []).filter((person) => person.status === 'join').length}</span></div>
      <div class="event-actions">${event.role === 'host' && !target.id.includes('past') ? ` <a class="edit-event-btn" href="/organizer?edit=${event.slug}">編輯</a>` : ''}${event.role === 'host' && target.id === 'pastList' ? ` <button type="button" class="secondary-btn repeat-event-btn" data-slug="${event.slug}">再辦一次</button>` : ''}</div>
    </article>`).join('');

  target.querySelectorAll('.event-item').forEach((card) => {
    const openCard = () => { window.location.href = card.dataset.eventUrl; };
    card.addEventListener('click', (event) => {
      if (!event.target.closest('a, button')) openCard();
    });
    card.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a, button')) {
        event.preventDefault();
        openCard();
      }
    });
  });

  target.querySelectorAll('.event-code-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyText(button.dataset.code, button, '已複製');
    });
  });

  target.querySelectorAll('.repeat-event-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.location.href = `/organizer?repeat=${button.dataset.slug}`;
    });
  });

}

if (workspaceGreeting) {
  fetch('/api/me/dashboard')
    .then((response) => {
      if (!response.ok) throw new Error('未登入');
      return response.json();
    })
    .then((data) => {
      workspaceGreeting.textContent = `${data.user.nickname || data.user.fullName} 的工作台`;
      renderDashboardEvents(workspaceLists.current, data.current, '目前沒有進行中的活動。');
      renderDashboardEvents(workspaceLists.past, data.past, '目前沒有已結束的活動。');
      if (notificationDot && data.unreadNotifications) notificationDot.classList.remove('hidden');
      if (notificationPopover) {
        notificationPopover.innerHTML = data.notifications.length
          ? data.notifications.map((notification) => `<div class="notification-item"><strong>${notification.message}</strong><small>${new Date(notification.createdAt).toLocaleString('zh-TW')}</small></div>`).join('')
          : '<div class="empty-state">目前沒有活動通知。</div>';
      }
    })
    .catch(() => { window.location.href = '/login'; });
}

if (notificationBell && notificationPopover) {
  notificationBell.addEventListener('click', async () => {
    notificationPopover.classList.toggle('hidden');
    if (!notificationPopover.classList.contains('hidden')) {
      notificationDot?.classList.add('hidden');
      await fetch('/api/notifications/read', { method: 'POST' });
    }
  });
}

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');

if (code) {
  fetch(`/api/events/code/${code}`)
    .then((res) => res.json())
    .then((data) => {
      if (!data.event) {
        const title = document.getElementById('eventTitle');
        if (title) title.textContent = '找不到活動';
        return;
      }

      const event = data.event;
      const inviteSlug = event.slug;
      const guestNameInput = document.getElementById('guestName');
      const rsvpHeading = document.getElementById('rsvpHeading');
      const rsvpForm = document.getElementById('rsvpForm');
      const statusBadge = document.getElementById('statusBadge');
      const attendanceSummary = document.getElementById('attendanceSummary');
      const attendeeList = document.getElementById('attendeeList');
      const cancelBox = document.getElementById('cancelBox');
      let isOrganizer = false;

      if (shareEventCode) shareEventCode.textContent = event.code;
      if (shareInviteLink) shareInviteLink.value = `${window.location.origin}/invite?code=${event.code}`;
      if (copyShareCodeBtn) copyShareCodeBtn.addEventListener('click', () => copyText(event.code, copyShareCodeBtn, '已複製'));
      if (copyShareLinkBtn) copyShareLinkBtn.addEventListener('click', () => copyText(shareInviteLink.value, copyShareLinkBtn, '已複製'));

      const renderAttendance = (participants) => {
        const confirmed = (participants || []).filter((participant) => participant.status === 'join');
        if (attendanceSummary) attendanceSummary.textContent = `目前 ${confirmed.length} 人確定參加`;
        if (attendeeList) {
          attendeeList.innerHTML = '';
          confirmed.forEach((participant) => {
            const item = document.createElement('li');
            item.textContent = participant.name;
            attendeeList.appendChild(item);
          });
          attendeeList.classList.toggle('hidden', confirmed.length === 0);
        }
      };

      document.getElementById('eventTitle').textContent = event.title;
      document.getElementById('eventSummary').textContent = event.summary;
      document.getElementById('eventDate').textContent = event.endDate && event.endDate !== event.date
        ? `${event.date} - ${event.endDate}`
        : event.date;
      document.getElementById('eventTime').textContent = `${event.startTime || '未設定'} - ${event.endTime || '未設定'}`;
      const mapQuery = event.latitude && event.longitude
        ? `${event.latitude},${event.longitude}`
        : event.address || event.location;
      const eventLocation = document.getElementById('eventLocation');
      eventLocation.textContent = event.location;
      eventLocation.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
      document.getElementById('eventOrganizer').textContent = event.organizerName;

      if (event.address) {
        document.getElementById('eventAddress').textContent = event.address;
        document.getElementById('eventAddressBox').classList.remove('hidden');
      }

      if (event.notes) {
        document.getElementById('eventNotes').textContent = event.notes;
        document.getElementById('eventNotesBox').classList.remove('hidden');
      }

      const forecast = event.weatherForecast || {};
      document.getElementById('weatherTemp').textContent = forecast.temp || '--';
      document.getElementById('weatherCondition').textContent = forecast.condition || '--';
      document.getElementById('weatherRain').textContent = forecast.rainChance || '--';
      document.getElementById('weatherWind').textContent = forecast.wind || '--';
      document.getElementById('weatherIcon').textContent = forecast.condition?.includes('雨') ? '🌧️' : '☀️';
      const weatherBasis = document.getElementById('weatherBasis');
      if (weatherBasis) {
        weatherBasis.textContent = '此為活動當日預測天氣，實際情況可能有所不同，請自行留意。';
      }

      const storedName = localStorage.getItem('party_current_name');
      if (storedName && guestNameInput) {
        guestNameInput.value = storedName;
      }

      fetch('/api/auth/session')
        .then((response) => response.ok ? response.json() : null)
        .then((sessionData) => {
          if (sessionData?.user && guestNameInput && !guestNameInput.value) {
            guestNameInput.value = sessionData.user.nickname || sessionData.user.fullName;
            localStorage.setItem('party_current_name', guestNameInput.value);
          }
        });

      renderAttendance(event.participants);

      fetch('/api/auth/session')
        .then((response) => response.ok ? response.json() : null)
        .then((sessionData) => {
          isOrganizer = sessionData?.user?.id === event.organizerId;
          if (isOrganizer) {
            if (shareBox) shareBox.classList.remove('hidden');
            if (rsvpHeading) rsvpHeading.textContent = '參加情形';
            if (rsvpForm) rsvpForm.classList.add('hidden');
            if (statusBadge) statusBadge.classList.add('hidden');
            if (cancelBox) cancelBox.classList.add('hidden');
          }
        });

      const updateBadge = (status) => {
        if (!statusBadge) return;

        if (status === 'join') {
          statusBadge.textContent = '已參加';
          statusBadge.className = 'status-badge join';
        } else if (status === 'decline') {
          statusBadge.textContent = '不參加';
          statusBadge.className = 'status-badge decline';
        } else {
          statusBadge.textContent = '尚未回覆';
          statusBadge.className = 'status-badge neutral';
        }
      };

      const currentStatus = localStorage.getItem(`party_${inviteSlug}_status`);
      if (currentStatus) {
        updateBadge(currentStatus);
      }

      if (rsvpForm) {
        rsvpForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const guestName = guestNameInput.value.trim();
          if (!guestName) {
            alert('請輸入你的名字');
            return;
          }

          localStorage.setItem('party_current_name', guestName);
          localStorage.setItem(`party_${inviteSlug}_status`, 'join');

          const response = await fetch(`/api/events/${inviteSlug}/rsvp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: guestName, status: 'join' })
          });

          const result = await response.json();
          if (!response.ok) {
            if (response.status === 401) {
              window.location.href = '/login';
              return;
            }
            alert(result.message || '提交失敗');
            return;
          }

          updateBadge('join');
          renderAttendance(result.event.participants);
        });
      }

      const declineButton = document.querySelector('[data-status="decline"]');
      if (declineButton) {
        declineButton.addEventListener('click', async () => {
          const guestName = guestNameInput.value.trim();
          if (!guestName) {
            alert('請先輸入你的名字');
            return;
          }

          localStorage.setItem('party_current_name', guestName);
          localStorage.setItem(`party_${inviteSlug}_status`, 'decline');

          const response = await fetch(`/api/events/${inviteSlug}/rsvp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: guestName, status: 'decline' })
          });

          const result = await response.json();
          if (!response.ok) {
            if (response.status === 401) {
              window.location.href = '/login';
              return;
            }
            alert(result.message || '提交失敗');
            return;
          }

          updateBadge('decline');
          renderAttendance(result.event.participants);
        });
      }

      const cancelForm = document.getElementById('cancelForm');
      if (cancelForm) {
        cancelForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const name = document.getElementById('cancelName').value.trim();
          const reason = document.getElementById('cancelReason').value.trim();

          if (!name || !reason) {
            alert('請填寫姓名與取消理由');
            return;
          }

          const response = await fetch(`/api/events/${inviteSlug}/cancel-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, reason })
          });

          const result = await response.json();
          if (!response.ok) {
            alert(result.message || '提交失敗');
            return;
          }

          alert(result.message);
          cancelForm.reset();
        });
      }

      const eventDateValue = new Date(`${event.date}T${event.startTime || '00:00'}`);
      const now = new Date();
      const hoursLeft = (eventDateValue - now) / 3600000;
      if (cancelBox && !isOrganizer && hoursLeft > 0 && hoursLeft <= 12 && localStorage.getItem(`party_${inviteSlug}_status`) === 'join') {
        cancelBox.classList.remove('hidden');
      }
    })
    .catch(() => {
      const title = document.getElementById('eventTitle');
      if (title) title.textContent = '活動載入失敗';
    });
}
