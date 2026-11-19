  (function (Drupal, drupalSettings, once) {
  'use strict';

  // CiviCRM field names. Change "contact_1" / "address_1" if needed.
  const F = {
    street:  'civicrm_1_contact_1_address_street_address',
    postal:  'civicrm_1_contact_1_address_postal_code',
    city:    'civicrm_1_contact_1_address_city',
    country: 'civicrm_1_contact_1_address_country_id',
    lat:     'civicrm_1_contact_1_address_geo_code_1',
    lon:     'civicrm_1_contact_1_address_geo_code_2',
    kommune: 'civicrm_1_contact_1_address_custom_102',
    dist:    'civicrm_1_contact_1_address_custom_114',
  };

      /**
       * Convert UTM coordinates to latitude/longitude (decimal degrees).
       *
       * @param {number} easting   UTM easting in metres
       * @param {number} northing  UTM northing in metres
       * @param {number} zone      UTM zone number (1–60). Denmark: 32 (Bornholm: 33)
       * @param {boolean} [northern=true]  true for the northern hemisphere
       * @param {object} [ellipsoid]  { a, f } – defaults to GRS80 (ETRS89/EUREF89).
       *                              Use { a: 6378137, f: 1 / 298.257223563 } for WGS84.
       * @returns {{ lat: number, lon: number }}
       *
       * Accuracy: well under a metre within the zone.
       */
      function utmToLatLon(easting, northing, zone = 32, northern = true,
        ellipsoid = { a: 6378137, f: 1 / 298.257223563 }) {
          const {a, f} = ellipsoid;
          const k0 = 0.9996;
          const e2 = f * (2 - f);          // eccentricity squared
          const ep2 = e2 / (1 - e2);       // second eccentricity squared

          const x = easting - 500000;
          const y = northern ? northing : northing - 10000000;

          // Footpoint latitude
          const M = y / k0;
          const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
          const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

          const phi1 = mu
            + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
            + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
            + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);

          const sin1 = Math.sin(phi1);
          const cos1 = Math.cos(phi1);
          const tan1 = Math.tan(phi1);

          const N1 = a / Math.sqrt(1 - e2 * sin1 ** 2);
          const R1 = a * (1 - e2) / Math.pow(1 - e2 * sin1 ** 2, 1.5);
          const T1 = tan1 ** 2;
          const C1 = ep2 * cos1 ** 2;
          const D = x / (N1 * k0);

          const lat = phi1 - (N1 * tan1 / R1) * (
            D ** 2 / 2
            - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
            + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720
            );

          const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180; // central meridian
          const lon = lon0 + (
            D
            - (1 + 2 * T1 + C1) * D ** 3 / 6
            + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120
            ) / cos1;

          return {lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI};
      }

      function kasDistance(lat, lon) {
          const R = 6371; // Earth's mean radius in km
          const toRad = (deg) => (deg * Math.PI) / 180;
          //Lat = 55.7156669147067, Long = 12.5850113992046
          const kasLat = 55.7156669147067;
          const kasLong = 12.5850113992046;

          const dLat = toRad(kasLat - lat);
          const dLon = toRad(kasLong - lon);

          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(kasLat)) * Math.cos(toRad(lat)) * Math.sin(dLon / 2) ** 2;

          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
      }


  function setVal(form, name, value) {
    const el = form.querySelector('[name="' + name + '"]');
    if (el && value !== undefined && value !== null) {
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  Drupal.behaviors.webformAdressevaelger = {
    attach(context) {
      once('adressevaelger', '.webform-submission-form', context).forEach((form) => {
        const street = form.querySelector('[name="' + F.street + '"]');
        if (!street || typeof adressevaelger === 'undefined') {
          return;
        }

        // The component expects the input inside a container.
        const wrap = document.createElement('div');
        wrap.className = 'autocomplete-container';
        street.parentNode.insertBefore(wrap, street);
        wrap.appendChild(street);

        adressevaelger.adressevaelger(street, {
          token: drupalSettings.adressevaelger.token,
          select(selected) {
            console.log('Adressevælger:', selected); // Check the structure, then remove.

            // Field names follow the Adressevælger API. Verify them in the console.
            const a  = selected.adresse || selected;
            const hn = a.husnummer || selected.husnummer || {};
            const pn = hn.postnummer || {};
            let coor = utmToLatLon(a.husnummer.adgangspunkt.koordinater.x, a.husnummer.adgangspunkt.koordinater.y);
            let distance = kasDistance(coor.lat, coor.lon).toFixed(1);

            let line = [hn.vejnavn, hn.husnummertekst].filter(Boolean).join(' ');
            const unit = [a.etagebetegnelse, a.doerbetegnelse].filter(Boolean).join('. ');
            if (unit) line += ', ' + unit;

            setVal(form, F.street, line);
            setVal(form, F.postal, pn.postnr);
            setVal(form, F.city, pn.navn);
            setVal(form, F.country, '1059'); // Denmark in CiviCRM. Check the ID in your install.
//            setVal(form, F.lat, coor.lat.toFixed(10));
//            setVal(form, F.lon, coor.lon.toFixed(10));
            setVal(form, F.kommune, a.husnummer.navngivenvejkommunedel.kommune);
            setVal(form, F.dist, distance);
          },
        });
      });
    },
  };
})(Drupal, drupalSettings, once);