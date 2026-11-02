// Native details remains usable without JavaScript. Expand the desktop index.
const navigation = document.getElementById('navigation');
if (navigation) {
  const desktop = window.matchMedia('(min-width: 68rem)');
  const updateNavigation = () => { navigation.open = desktop.matches; };
  updateNavigation();
  desktop.addEventListener('change', updateNavigation);
}
