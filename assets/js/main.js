document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  const navbar = document.getElementById('navbar');
  const authorFollow = document.getElementById('authorFollow');
  const authorLinks = document.getElementById('authorLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('active');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  if (authorFollow && authorLinks) {
    authorFollow.addEventListener('click', () => {
      const isOpen = authorLinks.classList.toggle('open');
      authorFollow.setAttribute('aria-expanded', String(isOpen));
    });
  }

  if (navbar) {
    const updateNavbar = () => navbar.classList.toggle('scrolled', window.scrollY > 8);
    updateNavbar();
    window.addEventListener('scroll', updateNavbar, { passive: true });
  }
});
