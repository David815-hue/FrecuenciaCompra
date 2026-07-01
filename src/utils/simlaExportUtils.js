const cleanCell = (value) => {
    const text = String(value ?? '').trim();
    return text.toLowerCase() === 'nan' ? '' : text;
};

export const normalizeColumnName = (value) => cleanCell(value)
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export const normalizeHondurasPhone = (value) => {
    let digits = cleanCell(value).replace(/\.0$/, '').replace(/\D/g, '');
    if (digits.startsWith('504') && digits.length === 11) digits = digits.slice(3);
    return digits.length === 8 ? digits : '';
};

const findColumn = (row, aliases) => {
    const normalizedAliases = aliases.map(normalizeColumnName);
    return Object.keys(row || {}).find(key => normalizedAliases.includes(normalizeColumnName(key)));
};

const findPhoneColumn = (row) => Object.keys(row || {}).find(key => {
    const normalized = normalizeColumnName(key);
    return normalized.startsWith('tel') && normalized.includes('contacto');
});

const recordQuality = (record) => [record.name, record.lastName, record.email]
    .filter(Boolean)
    .length;

export const crossCustomersWithSimla = (customers, simlaRows, getSegmentLabel) => {
    const simlaByPhone = new Map();
    let invalidSimlaPhones = 0;
    let duplicatePhones = 0;

    const phoneColumn = (simlaRows || [])
        .map(findPhoneColumn)
        .find(Boolean);
    if (!phoneColumn) {
        throw new Error("El archivo debe incluir la columna 'Telefono de contacto'.");
    }

    (simlaRows || []).forEach(row => {
        const phone = normalizeHondurasPhone(row[phoneColumn]);
        if (!phone) {
            invalidSimlaPhones += 1;
            return;
        }

        const nameColumn = findColumn(row, ['Nombre']);
        const lastNameColumn = findColumn(row, ['Apellido']);
        const emailColumn = findColumn(row, ['E-mail', 'Email', 'Correo']);
        const candidate = {
            name: cleanCell(nameColumn ? row[nameColumn] : ''),
            lastName: cleanCell(lastNameColumn ? row[lastNameColumn] : ''),
            email: cleanCell(emailColumn ? row[emailColumn] : '')
        };

        if (simlaByPhone.has(phone)) {
            duplicatePhones += 1;
            if (recordQuality(candidate) <= recordQuality(simlaByPhone.get(phone))) return;
        }
        simlaByPhone.set(phone, candidate);
    });

    let matched = 0;
    let unmatched = 0;
    let invalidRfmPhones = 0;

    const rows = (customers || []).map(customer => {
        const phone = normalizeHondurasPhone(customer.phone);
        const simla = phone ? simlaByPhone.get(phone) : null;
        if (!phone) invalidRfmPhones += 1;
        else if (simla) matched += 1;
        else unmatched += 1;

        const validSimlaEmail = simla?.email && simla.email.includes('@') ? simla.email : '';
        const generatedEmail = phone ? `simla504${phone}@puntofarma.hn` : '';

        return {
            'Nombre': simla?.name || cleanCell(customer.name),
            'Apellido': simla?.lastName || '',
            'Telefono': phone ? `504${phone}` : '',
            'Correo': validSimlaEmail || generatedEmail || cleanCell(customer.email),
            'Ciudad': cleanCell(customer.city),
            'Segmento': getSegmentLabel(customer.rfm?.segment)
        };
    });

    return {
        rows,
        summary: {
            total: rows.length,
            matched,
            unmatched,
            invalidRfmPhones,
            invalidSimlaPhones,
            duplicatePhones
        }
    };
};
