/* ==========================================================================
   RehabPlus — central configuration
   --------------------------------------------------------------------------
   Business details, services, practitioners and the API endpoints used by the
   front end. The matching server code lives in /functions (Cloudflare Pages
   Functions); see README.md for deployment.

   API CONTRACT
   --------------------------------------------------------------------------
   GET  /api/availability ?doctorId=&serviceId=&date=YYYY-MM-DD&tz=<IANA>
        -> { slots: [ { start: ISO-UTC, end: ISO-UTC, available: boolean } ] }
   POST /api/book    { serviceId, doctorId, start, timezone, consultation,
                       patient: { name, email, phone, country, concern },
                       consent: true, website: "" }
        -> { status: "confirmed" | "pending", reference: "RP-XXXXXX" }
        409 = slot already taken. The UI only says "confirmed" when the
        server returns status "confirmed".
   POST /api/contact { name, email, subject, message, consent: true, website: "" }
        -> { ok: true }
   POST /api/chat    { messages: [ { role: "user"|"assistant", content } ] }
        -> { reply: "..." }       (server calls Groq; the key never reaches the browser)

   DEMO MODE: opening the HTML files straight from disk (file://) or adding
   ?demo=1 to a URL clears the endpoints, so the pages run as a clearly labelled
   demo without a server.
   ========================================================================== */
window.REHABPLUS_CONFIG = {
  endpoints: {
    availability: "/api/availability",
    book: "/api/book",
    contact: "/api/contact",
    chat: "/api/chat",
  },

  // Set to false once the sample testimonials / statistics are replaced with real ones.
  showSampleNotes: true,

  // "Watch Our Story" video (YouTube ID). Replace with your own clinic video.
  storyVideo: { id: "Hy1qjQomD8Y", title: "Physical Therapy — Mayo Clinic" },

  // Optional human hand-off: a WhatsApp link (https://wa.me/<number>), Crisp, Tawk.to, Chatwoot...
  humanChatUrl: "",
  reviewsUrl: "",

  clinic: {
    name: "RehabPlus",
    address: "123 Health Drive, New York, NY 10001",
    phone: "0321 5459190",
    email: "wa6901258@gmail.com",
    hours: "Mon – Sat, 8:00 AM – 8:00 PM",
    mapEmbedUrl:
      "https://www.openstreetmap.org/export/embed.html?bbox=-74.0060%2C40.7380%2C-73.9660%2C40.7590&layer=mapnik&marker=40.7484%2C-73.9857",
    directionsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=40.7484,-73.9857",
    social: {
      facebook: "https://www.facebook.com/",
      instagram: "https://www.instagram.com/",
      linkedin: "https://www.linkedin.com/",
      youtube: "https://www.youtube.com/",
    },
  },

  // Icons are Font Awesome Free names (without the "fa-" prefix).
  services: [
    {
      id: "orthopedic",
      name: "Orthopedic Therapy",
      icon: "bone",
      short: "Joint, bone and muscle conditions.",
      long: "Hands-on and exercise-based care for joint, bone and muscle problems, from stiff shoulders and back pain to recovery after fractures.",
    },
    {
      id: "sports",
      name: "Sports Injury Rehabilitation",
      icon: "person-running",
      short: "Get back to your active lifestyle.",
      long: "Structured rehabilitation that restores strength, mobility and confidence so you can return to training and play safely.",
    },
    {
      id: "neurological",
      name: "Neurological Therapy",
      icon: "brain",
      short: "Support for brain and nerve conditions.",
      long: "Specialist support for balance, movement and coordination difficulties linked to conditions affecting the brain and nerves.",
    },
    {
      id: "pediatric",
      name: "Pediatric Therapy",
      icon: "baby",
      short: "Helping children reach their full potential.",
      long: "Gentle, play-based therapy that supports children’s motor development, strength and coordination.",
    },
    {
      id: "geriatric",
      name: "Geriatric Therapy",
      icon: "person-cane",
      short: "Improve mobility and independence.",
      long: "Care that helps older adults stay steady, strong and independent, including balance and fall-prevention programs.",
    },
    {
      id: "chronic-pain",
      name: "Chronic Pain Management",
      icon: "bolt",
      short: "Long-term pain relief solutions.",
      long: "A structured plan combining movement, manual therapy and education to help you manage persistent pain.",
    },
    {
      id: "tmj",
      name: "TMJ Therapy",
      icon: "face-smile",
      short: "Relieve jaw pain and improve function.",
      long: "Targeted therapy for jaw pain, clicking and tension to help you chew, speak and rest more comfortably.",
    },
    {
      id: "post-surgery",
      name: "Post-Surgery Rehabilitation",
      icon: "heart-pulse",
      short: "Safe and effective recovery.",
      long: "Guided rehabilitation after surgery, progressing at the right pace to restore movement and strength safely.",
    },
  ],

  // Practitioner ids must match the `doctors` rows in supabase/schema.sql.
  doctors: [
    {
      id: "dr-1",
      name: "Dr. Sarah Miller",
      specialty: "Orthopedic Specialist",
      years: 10,
      services: ["orthopedic", "sports", "post-surgery", "chronic-pain"],
      modes: ["in-person", "online"],
      focus: ["Sports injuries", "Joint & muscle pain", "Posture & rehab"],
      photo:
        "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&crop=faces&w=160&h=160&q=75",
    },
    {
      id: "dr-2",
      name: "Dr. Daniel Ortiz",
      specialty: "Sports Rehabilitation",
      years: 8,
      services: ["sports", "orthopedic", "post-surgery"],
      modes: ["in-person"],
      focus: ["Return-to-sport", "Ligament recovery", "Strength programs"],
      photo:
        "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&crop=faces&w=160&h=160&q=75",
    },
    {
      id: "dr-3",
      name: "Dr. Amina Rahman",
      specialty: "Neurological Physiotherapist",
      years: 12,
      services: ["neurological", "geriatric", "chronic-pain"],
      modes: ["in-person", "online"],
      focus: ["Balance & gait", "Stroke recovery", "Mobility"],
      photo:
        "https://images.unsplash.com/photo-1659353888906-adb3e0041693?auto=format&fit=crop&crop=faces&w=160&h=160&q=75",
    },
    {
      id: "dr-4",
      name: "Dr. Lucas Bernard",
      specialty: "Pediatric & TMJ Therapist",
      years: 7,
      services: ["pediatric", "tmj"],
      modes: ["in-person", "online"],
      focus: ["Child development", "Jaw pain", "Motor skills"],
      photo:
        "https://images.unsplash.com/photo-1637059824899-a441006a6875?auto=format&fit=crop&crop=faces&w=160&h=160&q=75",
    },
  ],

  faq: [
    {
      q: "How do I book an appointment?",
      a: "Use the booking page: choose a service, a doctor, a date and time, then enter your details.",
    },
    {
      q: "Which services do you offer?",
      a: "Orthopedic, sports injury, neurological, pediatric, geriatric, chronic pain, TMJ and post-surgery rehabilitation.",
    },
    {
      q: "Do you offer online consultations?",
      a: "Some practitioners offer online sessions. You will see this option in the booking form when it is available.",
    },
    {
      q: "Can the assistant give medical advice?",
      a: "No. It can explain our services and help you book, but it cannot diagnose or recommend treatment. Please book a consultation for clinical advice.",
    },
  ],
};

// Demo mode when opened from disk or with ?demo=1 (no server available).
(function () {
  var c = window.REHABPLUS_CONFIG;
  var demo =
    window.location.protocol === "file:" ||
    /[?&]demo=1\b/.test(window.location.search);
  if (demo) c.endpoints = { availability: "", book: "", contact: "", chat: "" };
})();
