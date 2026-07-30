import { renderCarousel } from './render.mjs';

const data = {
  name: 'test-karuzela',
  eyebrow: 'ZOVU · SOCIAL MEDIA',
  title: '5 błędów, które kosztują Cię klientów',
  subtitle: 'Widzimy je u 9 z 10 firm, z którymi zaczynamy pracę.',
  items: [
    { heading: 'Publikujesz nieregularnie', text: 'Algorytm nagradza rytm, nie zrywy raz na miesiąc.' },
    { heading: 'Mówisz o sobie, nie o kliencie', text: 'Zamień „oferujemy" na „zyskasz". Od razu widać różnicę.' },
    { heading: 'Brak jednego stylu', text: 'Konto ma wyglądać jak jedna marka, nie zbiór przypadków.' },
    { heading: 'Zero wezwania do działania', text: 'Post bez CTA to ładny obrazek, który nic nie sprzedaje.' },
    { heading: 'Nie mierzysz efektów', text: 'Bez liczb nie wiesz, co powtórzyć, a co wyrzucić.' },
  ],
  cta: {
    headline: 'Zrobimy to za Ciebie',
    line: 'Prowadzimy social media firm, które nie mają na to czasu.',
  },
  footer: 'zovu.pl',
};

const files = await renderCarousel(data);
console.log(JSON.stringify(files.map((f) => f.name), null, 1));
