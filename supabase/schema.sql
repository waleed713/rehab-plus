-- RehabPlus database schema for Supabase (Postgres).
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Row Level Security is enabled on every table with NO policies, so the public anon key
-- cannot read or write anything. Only the server (service-role key) can, via /functions.

create extension if not exists pgcrypto;

create table if not exists services (
  id         text primary key,
  name       text not null,
  active     boolean not null default true
);

create table if not exists doctors (
  id         text primary key,
  name       text not null,
  specialty  text not null,
  modes      text[] not null default array['in-person'],   -- 'in-person', 'online'
  active     boolean not null default true
);

create table if not exists doctor_services (
  doctor_id  text not null references doctors(id) on delete cascade,
  service_id text not null references services(id) on delete cascade,
  primary key (doctor_id, service_id)
);

-- Weekly working hours in the CLINIC time zone (CLINIC_TZ). weekday: 0 = Sunday ... 6 = Saturday.
-- Several rows per weekday allow breaks (e.g. 09:00-13:00 and 14:00-18:00).
create table if not exists availability_rules (
  id           bigint generated always as identity primary key,
  doctor_id    text not null references doctors(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  slot_minutes smallint not null default 60 check (slot_minutes between 10 and 240),
  check (end_time > start_time)
);
create index if not exists availability_rules_doctor_idx on availability_rules(doctor_id, weekday);

-- Holidays, leave, closures. doctor_id NULL = whole clinic closed.
create table if not exists time_off (
  id         bigint generated always as identity primary key,
  doctor_id  text references doctors(id) on delete cascade,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  reason     text,
  check (end_at > start_at)
);
create index if not exists time_off_range_idx on time_off(start_at, end_at);

create table if not exists appointments (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,
  service_id      text not null references services(id),
  doctor_id       text not null references doctors(id),
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  status          text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  consultation    text not null check (consultation in ('in-person', 'online')),
  patient_name    text not null,
  patient_email   text not null,
  patient_phone   text not null,
  patient_country text not null,
  concern         text not null,                 -- sensitive health-related text: restrict access to staff
  timezone        text not null,                 -- patient's IANA time zone
  consent_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  check (end_at > start_at)
);
-- The guarantee against double-booking: only one live appointment per doctor and start time,
-- enforced by the database even if two requests arrive at the same instant.
create unique index if not exists appointments_doctor_slot_uniq
  on appointments(doctor_id, start_at) where status in ('pending', 'confirmed');
create index if not exists appointments_doctor_time_idx on appointments(doctor_id, start_at);
create index if not exists appointments_email_idx on appointments(patient_email);

create table if not exists contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  subject    text not null,
  message    text not null,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  handled    boolean not null default false
);

alter table services           enable row level security;
alter table doctors            enable row level security;
alter table doctor_services    enable row level security;
alter table availability_rules enable row level security;
alter table time_off           enable row level security;
alter table appointments       enable row level security;
alter table contact_messages   enable row level security;

-- ---------------------------------------------------------------------------
-- Seed data. Ids must match public/config.js. Edit freely, then re-run the inserts.
-- ---------------------------------------------------------------------------
insert into services (id, name) values
  ('orthopedic',   'Orthopedic Therapy'),
  ('sports',       'Sports Injury Rehabilitation'),
  ('neurological', 'Neurological Therapy'),
  ('pediatric',    'Pediatric Therapy'),
  ('geriatric',    'Geriatric Therapy'),
  ('chronic-pain', 'Chronic Pain Management'),
  ('tmj',          'TMJ Therapy'),
  ('post-surgery', 'Post-Surgery Rehabilitation')
on conflict (id) do update set name = excluded.name;

insert into doctors (id, name, specialty, modes) values
  ('dr-1', 'Dr. Sarah Miller',  'Orthopedic Specialist',        array['in-person','online']),
  ('dr-2', 'Dr. Daniel Ortiz',  'Sports Rehabilitation',        array['in-person']),
  ('dr-3', 'Dr. Amina Rahman',  'Neurological Physiotherapist', array['in-person','online']),
  ('dr-4', 'Dr. Lucas Bernard', 'Pediatric & TMJ Therapist',    array['in-person','online'])
on conflict (id) do update set name = excluded.name, specialty = excluded.specialty, modes = excluded.modes;

insert into doctor_services (doctor_id, service_id) values
  ('dr-1','orthopedic'), ('dr-1','sports'), ('dr-1','post-surgery'), ('dr-1','chronic-pain'),
  ('dr-2','sports'), ('dr-2','orthopedic'), ('dr-2','post-surgery'),
  ('dr-3','neurological'), ('dr-3','geriatric'), ('dr-3','chronic-pain'),
  ('dr-4','pediatric'), ('dr-4','tmj')
on conflict do nothing;

-- Mon-Fri 09:00-13:00 and 14:00-18:00, Saturday 09:00-13:00, one-hour slots, for every doctor.
delete from availability_rules;
insert into availability_rules (doctor_id, weekday, start_time, end_time, slot_minutes)
select d.id, w.weekday, w.s::time, w.e::time, 60
from doctors d
cross join (values
  (1,'09:00','13:00'), (1,'14:00','18:00'),
  (2,'09:00','13:00'), (2,'14:00','18:00'),
  (3,'09:00','13:00'), (3,'14:00','18:00'),
  (4,'09:00','13:00'), (4,'14:00','18:00'),
  (5,'09:00','13:00'), (5,'14:00','18:00'),
  (6,'09:00','13:00')
) as w(weekday, s, e);
