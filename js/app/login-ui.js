// ============================================================
// LOGIN UI — Form đăng nhập/đăng ký/OTP, kiểm tra mật khẩu, theme
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

// ======================
// KHỞI TẠO BIẾN DOM
// ======================
const slider = document.getElementById('slider'),
  container = document.getElementById('container'),
  right = document.getElementById('right'),
  login = document.getElementById('login'),
  recover = document.getElementById('recover'),
  otpReset = document.getElementById('otp-reset'),
  forgotPassButton = document.getElementById('forgot-pass'),
  backToLoginButton = document.getElementById('back-to-login'),
  newAccountButton = document.getElementById('new-account'),
  signupSlideButton = document.getElementById('signup-slide-button'),
  loginSlideButton = document.getElementById('login-slide-button'),
  password = document.getElementById('signup-password'),
  passwordConfirmation = document.getElementById('signup-confirm-password'),
  passwordLabel = document.getElementById('password-label'),
  passwordConfirmationLabel = document.getElementById('confirm-password-label'),
  passwordRequirementsContainer = document.getElementById(
    'password-requirements-container'
  ),
  passwordRequirements = document.getElementById('password-requirements'),
  passwordRequirementsLength = document.getElementById(
    'password-requirements-length'
  ),
  passwordRequirementsNumber = document.getElementById(
    'password-requirements-number'
  ),
  passwordRequirementsLower = document.getElementById(
    'password-requirements-lower'
  ),
  passwordRequirementsUpper = document.getElementById(
    'password-requirements-upper'
  ),
  passwordRequirementsSpecial = document.getElementById(
    'password-requirements-special'
  ),
  forms = document.querySelectorAll('form'),
  inputs = document.querySelectorAll('.input'),
  passwordInputs = document.querySelectorAll('input[type="password"]'),
  validationIcons = document.querySelectorAll('.validation-icon'),
  labelWrappers = document.querySelectorAll('.label-wrapper'),
  labels = document.querySelectorAll('.label'),
  passwordEyes = document.querySelectorAll('.password-eye'),
  checkboxes = document.querySelectorAll('input[type="checkbox"]'),
  checkmarkLabels = document.querySelectorAll('.checkmark-label'),
  radios = document.querySelectorAll('input[type="radio"]'),
  radioButtonLabels = document.querySelectorAll('.radio-label');

// ======================
// REGEX VALIDATION
// ======================
const validMail = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
const validPassword =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d\s]).{8,32}$/;

// ======================
// HÀM CHUYỂN FORM DUY NHẤT
// ======================
function showSection(sectionId) {
  const formIds = ['login', 'recover', 'otp-reset'];
  formIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      if (id === sectionId) {
        el.classList.add('active');
        el.style.display = '';
      } else {
        el.classList.remove('active');
        el.style.display = 'none';
      }
    }
  });
}
// ======================
// CHUYỂN SLIDE VÀ FORM ĐĂNG NHẬP/ĐĂNG KÝ/QUÊN MẬT KHẨU
// ======================
function sliding() {
  if (signupSlideButton) {
    signupSlideButton.onclick = () => {
      slider.classList.add('slide');
      container.classList.add('slide');
      right.classList.add('active');
    };
  }

  if (loginSlideButton)
    loginSlideButton.onclick = () => {
      slider.classList.remove('slide');
      container.classList.remove('slide');
      right.classList.remove('active');
    };
  if (forgotPassButton) forgotPassButton.onclick = () => showSection('recover');
  if (backToLoginButton) backToLoginButton.onclick = () => showSection('login');
  if (newAccountButton)
    newAccountButton.onclick = () => {
      slider.classList.add('slide');
      container.classList.add('slide');
      setTimeout(() => {
        right.classList.add('active');
        showSection('login');
      }, 900);
    };
}
// ======================
// HIỆU ỨNG INPUT
// ======================
function inputStyling() {
  for (let i = 0; i < inputs.length; i++) {
    let elements = [inputs[i], labelWrappers[i], labels[i]];
    let values = new Array(inputs.length);
    let states = new Array(inputs.length);
    // Hover
    inputs[i].onmouseover = () => {
      elements.forEach((elm) => elm && elm.classList.add('hover'));
      inputs[i].nextElementSibling?.classList.add('hover');
      if (inputs[i].nextElementSibling?.nextElementSibling)
        inputs[i].nextElementSibling.nextElementSibling.classList.add('hover');
    };
    inputs[i].onmouseout = () => {
      elements.forEach((elm) => elm && elm.classList.remove('hover'));
      inputs[i].nextElementSibling?.classList.remove('hover');
      if (inputs[i].nextElementSibling?.nextElementSibling)
        inputs[i].nextElementSibling.nextElementSibling.classList.remove(
          'hover'
        );
    };
    // Focus
    inputs[i].onfocus = () => {
      if (inputs[i].classList.contains('valid')) states[i] = 'valid';
      else if (inputs[i].classList.contains('invalid')) states[i] = 'invalid';
      else states[i] = null;
      validationStyling('focused', inputs[i], labels[i], i);
      elements.forEach((elm) => elm && elm.classList.add('active'));
      inputs[i].nextElementSibling?.classList.add('active');
      if (inputs[i].nextElementSibling?.nextElementSibling)
        inputs[i].nextElementSibling.nextElementSibling.classList.add('active');
      if (inputs[i] == password)
        passwordRequirementsContainer &&
          passwordRequirementsContainer.classList.add('active');
      passwordRequirements && passwordRequirements.classList.add('active');
      if (inputs[i].value !== '') values[i] = inputs[i].value;
      else values[i] = null;
    };
    // Blur
    inputs[i].onblur = () => {
      if (inputs[i].value === '') {
        elements.forEach((elm) => elm && elm.classList.remove('active'));
        inputs[i].nextElementSibling?.classList.remove('active');
        if (inputs[i].nextElementSibling?.nextElementSibling)
          inputs[i].nextElementSibling.nextElementSibling.classList.remove(
            'active'
          );
        if (inputs[i] == password) {
          Array.from(passwordRequirements?.children || []).forEach((elm) => {
            elm.classList.remove('valid');
            elm.classList.remove('invalid');
            elm.firstElementChild.classList.remove(
              'uil-check-circle',
              'uil-times-circle'
            );
            elm.firstElementChild.classList.add('uil-info-circle');
          });
        }
      } else if (states[i] && inputs[i].value == values[i]) {
        validationStyling(states[i], inputs[i], labels[i], i);
      }
      if (
        (inputs[i] == password || inputs[i] == passwordConfirmation) &&
        password &&
        passwordConfirmation &&
        password.value !== '' &&
        passwordConfirmation.value !== ''
      ) {
        if (confirmPassword())
          validationStyling(
            'valid',
            passwordConfirmation,
            passwordConfirmationLabel,
            5
          );
        else
          validationStyling(
            'invalid',
            passwordConfirmation,
            passwordConfirmationLabel,
            5
          );
      }
      if (inputs[i] == password) {
        passwordRequirementsContainer &&
          passwordRequirementsContainer.classList.remove('active');
        passwordRequirements && passwordRequirements.classList.remove('active');
        Array.from(passwordRequirements?.children || []).forEach((elm) => {
          if (!elm.classList.contains('valid') && password.value !== '') {
            elm.classList.add('invalid');
            elm.firstElementChild.classList.remove('uil-info-circle');
            elm.firstElementChild.classList.add('uil-times-circle');
          }
        });
      }
    };
  }
}
// ======================
// HIỆU ỨNG MẮT PASSWORD
// ======================
function passwordVisibility() {
  for (let i = 0; i < passwordEyes.length; i++) {
    passwordEyes[i].onclick = function () {
      if (passwordInputs[i].type === 'password') {
        passwordInputs[i].type = 'text';
        this.classList.add('visible');
        this.lastElementChild &&
          (this.lastElementChild.attributes['data-tooltip'].value =
            'hide password');
      } else {
        passwordInputs[i].type = 'password';
        this.classList.remove('visible');
        this.lastElementChild &&
          (this.lastElementChild.attributes['data-tooltip'].value =
            'show password');
      }
    };
  }
}
// ======================
// VALIDATION UI ĐÚNG/SAI/FOCUS/EMPTY
// ======================
function validationStyling(type, input, label, iconIndex) {
  iconIndex *= 2;
  let eyeIndex = Array.from(passwordInputs).indexOf(input);
  if (eyeIndex === -1) eyeIndex = null;
  if (type == 'valid') {
    input.classList.remove('invalid');
    input.classList.add('valid');
    input.nextElementSibling.classList.remove('invalid');
    input.nextElementSibling.classList.add('valid');
    label.classList.remove('invalid');
    label.classList.add('valid');
    validationIcons[iconIndex + 1]?.classList.remove('active');
    validationIcons[iconIndex]?.classList.add('active');
    if (eyeIndex !== null) passwordEyes[eyeIndex].classList.add('valid');
  } else if (type == 'invalid') {
    input.classList.remove('valid');
    input.classList.add('invalid');
    label.classList.remove('valid');
    label.classList.add('invalid');
    input.nextElementSibling.classList.remove('valid');
    input.nextElementSibling.classList.add('invalid');
    validationIcons[iconIndex]?.classList.remove('active');
    validationIcons[iconIndex + 1]?.classList.add('active');
    if (eyeIndex !== null) passwordEyes[eyeIndex].classList.add('invalid');
  } else if (type == 'empty' || type == 'focused') {
    input.classList.remove('valid', 'invalid');
    label.classList.remove('valid', 'invalid');
    input.nextElementSibling.classList.remove('valid', 'invalid');
    validationIcons[iconIndex]?.classList.remove('active');
    validationIcons[iconIndex + 1]?.classList.remove('active');
    if (eyeIndex !== null)
      passwordEyes[eyeIndex].classList.remove('valid', 'invalid');
  }
  if (input == password && passwordConfirmation && passwordConfirmationLabel)
    validationStyling(
      'focused',
      passwordConfirmation,
      passwordConfirmationLabel,
      5
    );
}
// ======================
// CHECKBOX & RADIO
// ======================
function check() {
  for (let i = 0; i < checkmarkLabels.length; i++) {
    checkmarkLabels[i].onclick = () => {
      if (checkboxes[i]) checkboxes[i].checked = !checkboxes[i].checked;
    };
  }
  for (let i = 0; i < radioButtonLabels.length; i++) {
    radioButtonLabels[i].onclick = () => {
      if (radios[i]) radios[i].checked = true;
    };
  }
}
// ======================
// VALIDATE INPUT SIGNUP
// ======================
function inputValidation() {
  const inputArr = [
    {
      el: document.getElementById('signup-user'),
      label: document.getElementById('user-label'),
      type: 'username',
    },
    {
      el: document.getElementById('signup-company'),
      label: document.getElementById('company-label'),
      type: 'company',
    },
    {
      el: document.getElementById('signup-mail'),
      label: document.getElementById('mail-label'),
      type: 'mail',
    },
    {
      el: document.getElementById('signup-phone'),
      label: document.getElementById('phone-label'),
      type: 'phone',
    },
    {
      el: document.getElementById('signup-password'),
      label: document.getElementById('password-label'),
      type: 'password',
    },
    {
      el: document.getElementById('signup-confirm-password'),
      label: document.getElementById('confirm-password-label'),
      type: 'confirm-password',
    },
  ];
  inputArr.forEach((item, idx) => {
    if (!item.el) return;
    item.el.onchange = () => {
      let v = item.el.value.trim();
      if (item.type === 'username' || item.type === 'company') {
        if (v.length >= 3) validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      } else if (item.type === 'phone') {
        if (/^\d{8,15}$/.test(v.replace(/\D/g, '')))
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      } else if (item.type === 'mail') {
        if (validMail.test(v))
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      } else if (item.type === 'password') {
        if (validPassword.test(v))
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      } else if (item.type === 'confirm-password') {
        const passwordEl = document.getElementById('signup-password');
        if (v === passwordEl.value && v.length > 0)
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      }
    };
  });

  const password = document.getElementById('signup-password');
  if (password)
    password.oninput = () => {
      let value = password.value;
      const valid = (req) => {
        if (!req.classList.contains('invalid'))
          req.firstElementChild.classList.remove('uil-info-circle');
        req.classList.remove('invalid');
        req.classList.add('valid');
        req.firstElementChild.classList.remove('uil-times-circle');
        req.firstElementChild.classList.add('uil-check-circle');
      };
      const invalid = (req) => {
        if (req.classList.contains('valid')) {
          req.classList.remove('valid');
          req.classList.add('invalid');
          req.firstElementChild.classList.remove('uil-check-circle');
          req.firstElementChild.classList.add('uil-times-circle');
        }
      };
      if (value.length >= 8 && value.length <= 32)
        valid(passwordRequirementsLength);
      else invalid(passwordRequirementsLength);
      if (/\d/.test(value)) valid(passwordRequirementsNumber);
      else invalid(passwordRequirementsNumber);
      if (/[a-z]/.test(value)) valid(passwordRequirementsLower);
      else invalid(passwordRequirementsLower);
      if (/[A-Z]/.test(value)) valid(passwordRequirementsUpper);
      else invalid(passwordRequirementsUpper);
      if (/[^a-zA-Z\d\s]/.test(value)) valid(passwordRequirementsSpecial);
      else invalid(passwordRequirementsSpecial);
    };
}
function confirmPassword() {
  return (
    password &&
    passwordConfirmation &&
    password.value == passwordConfirmation.value
  );
}
// ======================
// FORM SHAKING HIỆU ỨNG
// ======================
function sumbitForms() {
  forms.forEach((form) => {
    if (form.id === 'signup-form' || form.id === 'login-form') return;
    form.onsubmit = (e) => {
      let ok = true;
      form.querySelectorAll('.info').forEach((infoBox) => {
        let input = infoBox.querySelector('[required]');
        if (
          input &&
          (input.classList.contains('invalid') ||
            input.value == '' ||
            (input.type == 'checkbox' && !input.checked))
        ) {
          ok = false;
          infoBox.classList.add('invalid-submission');
          setTimeout(() => {
            infoBox.classList.remove('invalid-submission');
          }, 825);
        }
      });
      if (!ok) e.preventDefault();
    };
  });
}
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => container.removeChild(toast), 500);
  }, duration);
}
function showLoading(show = true) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.toggle('active', show);
}
// ======================
// EXTRA THEMES (LOGIN ONLY)
// ======================
function extraThemes() {
  const loginView = document.getElementById('view-login');
  // Xóa bỏ "ổ khóa" bind 1 lần đi, thay bằng cơ chế gỡ event cũ trước khi gắn event mới
  if (!loginView) return;

  const openThemesButton = loginView.querySelector('#open-themes');
  const themes = loginView.querySelector('#themes');
  const themeLabels = loginView.querySelectorAll('.theme-label');
  const form = loginView.querySelector('#custom-theme-form');
  const closeThemesButton = loginView.querySelector('#close-themes');

  // ... (Khai báo các biến nút khác giữ nguyên) ...
  const clearCustomThemeBtn = loginView.querySelector('#clear-custom-theme');

  if (!openThemesButton || !themes || !form) return;

  // Dùng onclick trực tiếp sẽ tự động đè lên cái cũ, không sợ bị lặp sự kiện
  /* OPEN / CLOSE */
  openThemesButton.onclick = () => themes.classList.add('active');
  if (closeThemesButton)
    closeThemesButton.onclick = () => themes.classList.remove('active');

  // ... (Gắn sự kiện cho các nút khác giữ nguyên) ...

  if (clearCustomThemeBtn) {
    clearCustomThemeBtn.onclick = () => {
      loginView.removeAttribute('style');
      localStorage.removeItem('login_custom_theme');
    };
  }

  /* PRESET THEMES */
  themeLabels.forEach((label) => {
    label.onclick = () => {
      // 1. Lấy danh sách tất cả các ID của các nút Radio (sakura, winter, sunset...)
      const allThemeNames = Array.from(themeLabels).map((l) => l.htmlFor);

      // 2. Chỉ xóa những class nào nằm trong danh sách Theme, giữ nguyên các class nền tảng
      allThemeNames.forEach((themeName) => {
        loginView.classList.remove(themeName);
      });

      // 3. Thêm class của Theme mới được chọn
      loginView.classList.add(label.htmlFor);
      loginView.removeAttribute('style');

      // 4. Lưu lại cấu hình
      localStorage.setItem('login_theme', label.htmlFor);
      localStorage.removeItem('login_custom_theme');
    };
  });

  /* CUSTOM THEME */
  form.onsubmit = function (e) {
    e.preventDefault();

    let customTheme = '';
    const formdata = new FormData(form);

    loginView.removeAttribute('style');

    for (let [key, value] of formdata.entries()) {
      if (!value) continue;

      if (key === '--background-image') {
        customTheme += `${key}:url(${value});`;
      } else {
        customTheme += `${key}:${value};`;
      }

      if (key === '--body-color') {
        customTheme += `--body-color-gradient:${value}ec;`;
      }
    }

    loginView.setAttribute('style', customTheme);
    localStorage.setItem('login_custom_theme', customTheme);
    localStorage.removeItem('login_theme');
  };
}
// ======================
// MAIN ENTRYPOINT
// ======================
window.addEventListener('DOMContentLoaded', () => {
  sliding();
  inputStyling();
  passwordVisibility();
  check();
  inputValidation();
  sumbitForms();

  // ------- ĐĂNG KÝ (Đã chuyển sang Supabase) -------
  var signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.onsubmit = async function (e) {
      e.preventDefault();
      showLoading(true);
      const usernameInput = document.getElementById('signup-user');
      const companyInput = document.getElementById('signup-company');
      const emailInput = document.getElementById('signup-mail');
      const phoneInput = document.getElementById('signup-phone');
      const passwordInput = document.getElementById('signup-password');
      const confirmPasswordInput = document.getElementById(
        'signup-confirm-password'
      );
      const tosCheckbox = document.getElementById('tos');
      if (
        !usernameInput ||
        !companyInput ||
        !emailInput ||
        !phoneInput ||
        !passwordInput ||
        !confirmPasswordInput ||
        !tosCheckbox
      ) {
        showToast('Error: Form is not configured correctly!', 'error');
        showLoading(false);
        return;
      }

      // Kiểm tra validation (Giữ nguyên logic cũ của bạn)
      let ok = true;
      signupForm.querySelectorAll('.info').forEach((infoBox) => {
        let input = infoBox.querySelector('[required]');
        if (
          input &&
          (input.value == '' ||
            (input.type == 'checkbox' && !input.checked) ||
            (input.id == 'signup-mail' && !validMail.test(input.value)) ||
            (input.id == 'signup-password' &&
              !validPassword.test(input.value)) ||
            (input.id == 'signup-confirm-password' &&
              input.value !== passwordInput.value))
        ) {
          ok = false;
          infoBox.classList.add('invalid-submission');
          setTimeout(() => {
            infoBox.classList.remove('invalid-submission');
          }, 825);
        }
      });
      if (!ok) {
        showToast('Vui lòng nhập thông tin đầy đủ và chính xác!', 'error');
        showLoading(false);
        return;
      }

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const fullName = usernameInput.value.trim();
      const company = companyInput.value.trim();
      const phone = phoneInput.value.trim();

      try {
        // 1. Tạo tài khoản trên Auth
        const { data, error } = await supabaseClient.auth.signUp({
          email: email,
          password: password,
        });

        if (error) throw error;

        // 2. Do chúng ta đã có Trigger tạo profile tự động lúc tạo user (khi làm Database schema),
        // chúng ta chỉ cần Update thông tin cá nhân vào profile vừa được tạo đó.
        if (data && data.user) {
          const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({
              full_name: fullName,
              department: company,
              phone: phone,
              role: 'user', // Mặc định role user
              registration_status: 'pending', // Chờ duyệt
            })
            .eq('id', data.user.id);

          if (profileError) console.warn('Lỗi cập nhật profile:', profileError);
        }

        showToast(
          'Đăng ký thành công! Vui lòng chờ admin phê duyệt.',
          'success'
        );

        if (loginSlideButton) {
          loginSlideButton.click();
        }
        signupForm.reset();
      } catch (err) {
        showToast('Đăng ký thất bại: ' + err.message, 'error');
      } finally {
        showLoading(false);
      }
    };
  }

  // ------- QUÊN MẬT KHẨU (Đã chuyển sang Supabase) -------
  var recoverForm = document.getElementById('recover-form');
  if (recoverForm) {
    recoverForm.onsubmit = async function (e) {
      e.preventDefault();
      showLoading(true);
      var email = document.getElementById('recover-user').value.trim();
      if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
        showLoading(false);
        showToast('Please enter a valid email!', 'error');
        return;
      }

      try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(
          email
        );
        if (error) throw error;

        showToast('Email đặt lại mật khẩu đã được gửi!', 'success');
        // Không dùng OTP nữa vì Supabase gửi magic link qua email trực tiếp
        showSection('login');
      } catch (err) {
        showToast('Lỗi: ' + err.message, 'error');
      } finally {
        showLoading(false);
      }
    };
  }

  // ------- OTP & RESET PASSWORD -------
  // Vô hiệu hóa form này vì Supabase xử lý reset password thông qua Magic Link trong email, không cần nhập mã OTP tay.
  var otpForm = document.getElementById('otp-form');
  if (otpForm) {
    otpForm.style.display = 'none'; // Ẩn đi
  }

  // ------- Quay lại bước recover từ otp-reset -------
  var backBtn = document.getElementById('back-to-recover');
  if (backBtn) {
    backBtn.onclick = function () {
      showSection('recover');
    };
  }
});
window.onresize = () => {
  if (right && right.classList.contains('active') && signupSlideButton)
    signupSlideButton.click();
};
function resetLoginUI() {
  const loginView = document.getElementById('view-login');
  if (!loginView) return;

  loginView.querySelector('#login-form')?.reset();

  loginView.querySelector('.slider')?.classList.remove('slide');
  loginView.querySelector('.container')?.classList.remove('slide');
  loginView.querySelector('.right')?.classList.remove('active');

  loginView.querySelectorAll('.input').forEach((i) => {
    i.classList.remove('valid', 'invalid', 'active', 'hover');
  });

  // reset style (custom theme)
  loginView.removeAttribute('style');
}
function restoreLoginTheme() {
  const loginView = document.getElementById('view-login');
  if (!loginView) return;

  const preset = localStorage.getItem('login_theme');
  const custom = localStorage.getItem('login_custom_theme');

  if (preset) {
    loginView.classList.add(preset);
  }
  if (custom) {
    loginView.setAttribute('style', custom);
  }
}

let dashboardPoller = null; // Sẽ giữ ID của bộ đếm thời gian
const POLLING_INTERVAL = 30000; // 30000ms = 30 giây
