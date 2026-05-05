#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const TEMPLATE = path.join(__dirname, 'template.html');
const OUT_DIR = __dirname;

const template = fs.readFileSync(TEMPLATE, 'utf8');

const dataFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

let builtCount = 0;

for (const file of dataFiles) {
  const agent = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));

  const firstName = agent.name.split(' ')[0];
  const phoneRaw = agent.phone.replace(/[^+\d]/g, '');
  const neighborhoodsCsv = agent.neighborhoods.join(', ');

  // Neighborhood tags
  const neighborhoodTags = agent.neighborhoods
    .map(n => `<span class="tag tag--lavender">${n}</span>`)
    .join('\n            ');

  // Language list
  const languageList = agent.languages.join(' · ');

  // StreetEasy link (optional)
  const streetEasyLink = agent.streeteasy
    ? `<a href="${agent.streeteasy}" class="btn btn--outline" target="_blank" rel="noopener">StreetEasy ↗</a>`
    : '';

  // Instagram contact link (optional)
  const instagramContact = agent.instagram
    ? `<a href="${agent.instagram}" class="agent-contact-link" target="_blank" rel="noopener">
                <span class="agent-contact-link__icon">ig</span>
                Instagram
              </a>`
    : '';

  // Photo or initials
  const photoPath = `../../agents/photos/${agent.photo}`;
  const photoOrInitials = `<div class="agent-hero__photo-initials">${agent.initials}</div>`;

  // Specialty items
  const specialtyItems = (agent.specialties || [])
    .map(s => `<li>${s}</li>`)
    .join('\n              ');

  // Testimonials section
  let testimonialsSection = '';
  if (agent.testimonials && agent.testimonials.length > 0) {
    const cards = agent.testimonials.map(t => `
        <div class="testimonial-card fade-in">
          <div class="testimonial-card__quote">"</div>
          <p class="testimonial-card__body">${t.quote}</p>
          <div class="testimonial-card__author">
            <div class="testimonial-card__avatar">${t.author.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
            <div>
              <div class="testimonial-card__name">${t.author}</div>
              <div class="testimonial-card__detail">${t.detail}</div>
            </div>
          </div>
        </div>`).join('\n');

    testimonialsSection = `
  <!-- ── Client Testimonials ── -->
  <section class="agent-testimonials">
    <div class="container">
      <div class="fade-in">
        <p class="section-header__eyebrow">Client Stories</p>
        <h2 style="font-size:clamp(1.5rem,3vw,2rem);margin-top:0.5rem;">What clients say about ${firstName}</h2>
      </div>
      <div class="agent-testimonials-grid fade-in-group">
        ${cards}
      </div>
    </div>
  </section>`;
  }

  let html = template
    .replace(/{{NAME}}/g, agent.name)
    .replace(/{{FIRST_NAME}}/g, firstName)
    .replace(/{{TITLE}}/g, agent.title)
    .replace(/{{NEIGHBORHOODS_CSV}}/g, neighborhoodsCsv)
    .replace(/{{NEIGHBORHOOD_TAGS}}/g, neighborhoodTags)
    .replace(/{{LANGUAGE_LIST}}/g, languageList)
    .replace(/{{EMAIL}}/g, agent.email)
    .replace(/{{PHONE}}/g, agent.phone)
    .replace(/{{PHONE_RAW}}/g, phoneRaw)
    .replace(/{{STREETEASY_LINK}}/g, streetEasyLink)
    .replace(/{{INSTAGRAM_CONTACT}}/g, instagramContact)
    .replace(/{{PHOTO_COLOR_A}}/g, (agent.photoColor || ['#e8e6e0', '#d0ccbf'])[0])
    .replace(/{{PHOTO_COLOR_B}}/g, (agent.photoColor || ['#e8e6e0', '#d0ccbf'])[1])
    .replace(/{{PHOTO_OR_INITIALS}}/g, photoOrInitials)
    .replace(/{{BIO}}/g, agent.bio)
    .replace(/{{SPECIALTY_ITEMS}}/g, specialtyItems)
    .replace(/{{TESTIMONIALS_SECTION}}/g, testimonialsSection)
    .replace(/{{STAT_DEALS}}/g, agent.stats?.closedDeals ?? 0)
    .replace(/{{STAT_DAYS}}/g, agent.stats?.avgDaysOnMarket ?? 0)
    .replace(/{{STAT_RATING}}/g, agent.stats?.satisfactionRate ?? 0)
    .replace(/{{STAT_YEARS}}/g, agent.stats?.yearsExperience ?? 0);

  const outDir = path.join(OUT_DIR, agent.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');

  console.log(`✓  Built: /agents/${agent.slug}/index.html`);
  builtCount++;
}

console.log(`\nDone — ${builtCount} agent page${builtCount !== 1 ? 's' : ''} generated.`);
