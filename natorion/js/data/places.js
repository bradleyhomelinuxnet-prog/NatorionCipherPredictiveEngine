/* A short gazetteer for the HH:MM location picker (latitude within ±65°). */
(function (root) {
  var NC = root.NC || (root.NC = {});
  NC.PLACES = [
    ["Giza, Great Pyramid", 29.98, 31.13], ["Jerusalem", 31.78, 35.22], ["Babylon", 32.54, 44.42], ["Mecca", 21.42, 39.83],
    ["Cairo", 30.04, 31.24], ["Athens", 37.98, 23.73], ["Rome", 41.9, 12.5], ["Istanbul", 41.01, 28.98],
    ["London", 51.51, -0.13], ["Paris", 48.86, 2.35], ["Berlin", 52.52, 13.4], ["Madrid", 40.42, -3.7],
    ["Moscow", 55.76, 37.62], ["Stockholm", 59.33, 18.07], ["Reykjavík", 64.15, -21.94], ["Dublin", 53.35, -6.26],
    ["New York", 40.71, -74.01], ["Washington DC", 38.9, -77.04], ["Chicago", 41.88, -87.63], ["Dallas", 32.8, -96.8],
    ["Houston", 29.76, -95.37], ["Denver", 39.74, -104.99], ["Phoenix", 33.45, -112.07], ["Los Angeles", 34.05, -118.24],
    ["San Francisco", 37.77, -122.42], ["Seattle", 47.61, -122.33], ["Anchorage", 61.22, -149.9], ["Honolulu", 21.31, -157.86],
    ["Toronto", 43.65, -79.38], ["Mexico City", 19.43, -99.13], ["Chichén Itzá", 20.68, -88.57], ["Tikal", 17.22, -89.62],
    ["Cusco", -13.53, -71.97], ["São Paulo", -23.55, -46.63], ["Buenos Aires", -34.6, -58.38], ["Lagos", 6.52, 3.38],
    ["Nairobi", -1.29, 36.82], ["Johannesburg", -26.2, 28.05], ["Tehran", 35.69, 51.39], ["Mumbai", 19.08, 72.88],
    ["Delhi", 28.61, 77.21], ["Varanasi", 25.32, 82.97], ["Bangkok", 13.76, 100.5], ["Singapore", 1.35, 103.82],
    ["Beijing", 39.9, 116.41], ["Shanghai", 31.23, 121.47], ["Tokyo", 35.68, 139.69], ["Seoul", 37.57, 126.98],
    ["Sydney", -33.87, 151.21], ["Auckland", -36.85, 174.76], ["Easter Island", -27.11, -109.35], ["Stonehenge", 51.18, -1.83]
  ];
})(typeof window !== "undefined" ? window : globalThis);
