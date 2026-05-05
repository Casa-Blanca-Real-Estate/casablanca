'use strict';

const nav = document.querySelector('.nav');
const hamburger = document.querySelector('.nav__hamburger');
const navLinks = document.querySelector('.nav__links');

// Sticky nav with background on scroll
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
}, { passive: true });

// Mobile menu toggle
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('open');
    navLinks.classList.toggle('open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close on link click
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

// Close mobile menu on resize to desktop
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) {
    hamburger?.classList.remove('open');
    navLinks?.classList.remove('open');
    document.body.style.overflow = '';
  }
}, { passive: true });
