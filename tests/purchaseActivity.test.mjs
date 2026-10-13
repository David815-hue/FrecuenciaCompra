import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildPurchaseHistory, emptyPurchaseFilter, filterCustomersByPurchaseActivity,
    getCustomerKey, getPurchaseMonth, previousMonthFilter, purchaseFilterError,
    resolvePurchaseFilterForSearch } from '../src/utils/purchaseActivity.js';
import { buildFrequencyWorkbook, filterData } from '../src/utils/dataProcessing.js';
import { buildLastGestorIndex, getExportableCustomers, getLastGestorExportColumns } from '../src/utils/excelExport.js';

const order = (name, date, sku = '100', gestor = 'Ana', channel = 'POS') => ({
    name, customerName: name, email: `${name}@example.test`, phone: '', orderDate: date,
    gestorName: gestor, channel, totalAmount: 50,
    items: [{ sku, description: sku === '100' ? 'Producto A' : 'Producto B', quantity: 2, lineTotal: 50 }]
});
const data = [
    order('Pendiente', '2026-09-01'),
    order('OtroGestor', '2026-09-03'), order('OtroGestor', '2026-10-01', '100', 'Bea'),
    order('App', '2026-09-10'), order('App', '2026-10-02', '100', '', 'APP'),
    order('OtroProducto', '2026-09-11'), order('OtroProducto', '2026-10-03', '200'),
    order('Agosto', '2026-08-10'),
    order('Nueva', '2026-11-01'),
    order('SinContacto', '2026-09-20')
];
const customersFrom = orders => {
    const map = new Map();
    for (const o of orders) {
        const key = getCustomerKey(o);
        if (!map.has(key)) map.set(key, { name: o.name, email: o.email, orders: [],
            isContactSuppressed: o.name === 'SinContacto' });
        map.get(key).orders.push(o);
    }
    return [...map.values()];
};
const quick = previousMonthFilter(new Date('2026-10-05T12:00:00Z'));

test('mes anterior y actual incluyen año y respetan el calendario de Honduras', () => {
    assert.deepEqual(quick.boughtMonths, ['2026-09']);
    assert.deepEqual(quick.missingMonths, ['2026-10']);
    const january = previousMonthFilter(new Date('2026-01-05T12:00:00Z'));
    assert.deepEqual(january.boughtMonths, ['2025-12']);
    assert.equal(getPurchaseMonth('2026-10-01'), '2026-10');
    assert.equal(getPurchaseMonth('2026-10-01T02:00:00Z'), '2026-09');
    assert.equal(getPurchaseMonth('2026-10-01T06:00:00Z'), '2026-10');
    assert.equal(getPurchaseMonth('31/09/2026'), '');
    assert.equal(getPurchaseMonth('15/09/2026'), '2026-09');
});

test('excluye recompra por cualquier gestor, canal o producto', () => {
    const cohort = customersFrom(data.filter(o => o.gestorName === 'Ana'));
    const result = filterCustomersByPurchaseActivity(cohort, quick, buildPurchaseHistory(data));
    assert.deepEqual(result.map(c => c.name), ['Pendiente', 'SinContacto']);
    assert.equal(result[0].orders.length, 1);
    assert.equal(result[0].totalSpent, 50);
});

test('permite comparar el producto: comprar otro SKU no elimina al cliente', () => {
    const filter = { ...quick, scope: 'product', productQuery: '100' };
    const result = filterCustomersByPurchaseActivity(customersFrom(data), filter, buildPurchaseHistory(data, '100'));
    assert.deepEqual(result.map(c => c.name), ['Pendiente', 'OtroProducto', 'SinContacto']);
});

test('compara descripciones y SKU numéricos sin fallar', () => {
    const records = [order('P', '2026-09-05', 100)];
    records[0].items[0].description = 'Producto A';
    const filter = { ...quick, scope: 'product', productQuery: 'producto a' };
    assert.equal(filterCustomersByPurchaseActivity(customersFrom(records), filter,
        buildPurchaseHistory(records, 'producto a')).length, 1);
});

test('varios meses: compra en cualquiera y ausencia en todos', () => {
    const filter = { ...quick, boughtMonths: ['2026-08', '2026-09'], missingMonths: ['2026-10', '2026-11'] };
    const result = filterCustomersByPurchaseActivity(customersFrom(data), filter, buildPurchaseHistory(data));
    assert.deepEqual(result.map(c => c.name), ['Pendiente', 'Agosto', 'SinContacto']);
});

test('solo meses sin compra requiere un historial anterior y no incluye clientes posteriores', () => {
    const filter = { ...quick, boughtMonths: [] };
    const result = filterCustomersByPurchaseActivity(customersFrom(data), filter, buildPurchaseHistory(data));
    assert.deepEqual(result.map(c => c.name), ['Pendiente', 'Agosto', 'SinContacto']);
});

test('desactivar el filtro conserva la lista original', () => {
    const customers = customersFrom(data);
    assert.equal(filterCustomersByPurchaseActivity(customers, emptyPurchaseFilter(), buildPurchaseHistory(data)), customers);
});

test('selecciones incompletas, contradictorias o producto vacío no dan falsos resultados', () => {
    for (const filter of [{ ...quick, missingMonths: [] }, { ...quick, missingMonths: ['2026-09'] },
        { ...quick, scope: 'product', productQuery: '' }, { ...quick, missingMonths: ['2026-13'] }]) {
        assert.ok(purchaseFilterError(filter));
        assert.deepEqual(filterCustomersByPurchaseActivity(customersFrom(data), filter, buildPurchaseHistory(data)), []);
    }
});

test('Excel sin búsqueda incluye clientes filtrados, último gestor y explicación de los meses sin columnas por SKU', () => {
    const history = buildPurchaseHistory(data);
    const filtered = filterCustomersByPurchaseActivity(customersFrom(data), quick, history);
    const workbook = buildFrequencyWorkbook(filtered, '', { purchaseFilter: quick, lastDate: history.lastDate });
    const recovered = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(recovered.Sheets.Reporte);
    assert.deepEqual(rows.map(r => r.Cliente), ['Pendiente']);
    assert.match(rows[0]['Compraron en'], /septiembre de 2026/);
    assert.match(rows[0]['Sin compras en'], /octubre de 2026/);
    assert.equal(rows[0]['Última compra del criterio'], '01/09/2026');
    assert.equal(rows[0]['Último gestor'], 'Ana');
    assert.deepEqual(Object.keys(rows[0]), ['Cliente', 'Correo electrónico del cliente', 'Celular del cliente',
        'Identidad', 'Último gestor', 'Total Gastado', 'Compraron en', 'Sin compras en',
        'Criterio de recompra', 'Última compra del criterio']);
    assert.ok(recovered.Sheets.Filtros);
});

test('Excel exporta más de una página y conserva el orden recibido', () => {
    const orders = Array.from({ length: 75 }, (_, i) => order(`Cliente${i}`, '2026-09-05'));
    const filtered = filterCustomersByPurchaseActivity(customersFrom(orders), quick, buildPurchaseHistory(orders)).reverse();
    const workbook = buildFrequencyWorkbook(filtered, '', { purchaseFilter: quick });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Reporte);
    assert.equal(rows.length, 75);
    assert.equal(rows[0].Cliente, 'Cliente74');
});

test('Excel mantiene exclusiones de contacto generales y por SKU', () => {
    const customers = [{ name: 'A', isContactSuppressed: true },
        { name: 'B', contactSuppressedSkus: ['100'] }, { name: 'C', contactSuppressedSkus: ['200'] }];
    assert.deepEqual(getExportableCustomers(customers, '100').map(c => c.name), ['C']);
    assert.deepEqual(getExportableCustomers([{ name: 'D', contactSuppressedSkus: ['100'],
        orders: [order('D', '2026-09-05')] }], 'Producto A'), []);
});

test('la barra existente selecciona el SKU o descripción a comparar automáticamente', () => {
    for (const query of ['100', 'Producto A']) {
        const filter = resolvePurchaseFilterForSearch(quick, data, query);
        assert.equal(filter.scope, 'product');
        const cohort = customersFrom(filterData(data, query));
        const result = filterCustomersByPurchaseActivity(cohort, filter, buildPurchaseHistory(data, filter.productQuery));
        assert.deepEqual(result.map(c => c.name), ['Pendiente', 'OtroProducto', 'SinContacto']);
        const workbook = buildFrequencyWorkbook(result, query, { purchaseFilter: filter });
        assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets.Reporte).map(row => row.Cliente), ['Pendiente', 'OtroProducto']);
    }
});

test('cambiar o limpiar búsqueda elimina el producto anterior y vuelve a cualquier compra', () => {
    const product = resolvePurchaseFilterForSearch(quick, data, '100');
    assert.equal(resolvePurchaseFilterForSearch(product, data, '200').productQuery, '200');
    for (const query of ['', 'OtroProducto', 'pendiente@example.test']) {
        const filter = resolvePurchaseFilterForSearch(product, data, query);
        assert.equal(filter.scope, 'all');
        assert.equal(filter.productQuery, '');
    }
    const filter = resolvePurchaseFilterForSearch(product, data, 'OtroProducto');
    assert.deepEqual(filterCustomersByPurchaseActivity(customersFrom(filterData(data, 'OtroProducto')),
        filter, buildPurchaseHistory(data)), []);
});

test('cada vista usa su propia búsqueda aunque comparta los meses', () => {
    const tableFilter = resolvePurchaseFilterForSearch(quick, data, '200');
    const gestoresFilter = resolvePurchaseFilterForSearch(tableFilter, data, '100');
    assert.equal(gestoresFilter.productQuery, '100');
    const cohort = customersFrom(data.filter(order => order.gestorName === 'Ana'));
    const result = filterCustomersByPurchaseActivity(cohort, gestoresFilter, buildPurchaseHistory(data, '100'));
    assert.deepEqual(result.map(c => c.name), ['Pendiente', 'OtroProducto', 'SinContacto']);
});

test('Excel no crea columnas por SKU aunque el cliente tenga varios productos y meses', () => {
    const records = [order('Cliente', '2026-08-01', '100'), order('Cliente', '2026-09-02', '200')];
    const workbook = buildFrequencyWorkbook(customersFrom(records), '');
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Reporte);
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]), ['Cliente', 'Correo electrónico del cliente', 'Celular del cliente',
        'Identidad', 'Último gestor', 'Total Gastado']);
    assert.equal(rows[0]['Total Gastado'], '100.00');
});

test('último gestor usa todo el historial, aunque la compra más reciente no coincida con el SKU o mes filtrado', () => {
    const records = [order('Cliente', '2026-10-03', '200', 'Bea'), order('Cliente', '2026-09-01', '100', 'Ana')];
    const filter = { ...quick, scope: 'product', productQuery: '100' };
    const filtered = filterCustomersByPurchaseActivity(customersFrom(filterData(records, '100')), filter,
        buildPurchaseHistory(records, '100'));
    const lastGestorByCustomer = buildLastGestorIndex(records);
    const workbook = buildFrequencyWorkbook(filtered, '100', { purchaseFilter: filter, lastGestorByCustomer });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Reporte);
    assert.equal(rows[0]['Último gestor'], 'Bea');
    assert.equal(rows[0]['Total Gastado'], '50.00');
    // Same column helper used by the Gestores report, even when exporting Ana's customers.
    assert.equal(getLastGestorExportColumns(filtered[0], lastGestorByCustomer)['Último gestor'], 'Bea');
});

test('último gestor respeta hora, año y fechas válidas sin depender del orden de los pedidos', () => {
    const records = [order('Cliente', '2026-10-01T17:00:00Z', '100', 'Bea'),
        order('Cliente', '2026-10-01T12:00:00Z', '100', 'Ana'),
        order('Cliente', '31/02/2027', '100', 'Fecha inválida'),
        order('Cliente', '2025-12-31', '100', 'Anterior')];
    const columns = getLastGestorExportColumns(customersFrom(records)[0], buildLastGestorIndex(records));
    assert.equal(columns['Último gestor'], 'Bea');
});

test('compras sin gestor no borran la última atención identificada y los clientes sin atención tienen un texto claro', () => {
    const records = [order('Cliente', '2026-09-01', '100', 'Ana'),
        order('Cliente', '2026-10-02', '100', ''), order('Cliente', '2026-10-03', '100', 'Sin Asignar'),
        order('SinGestor', '2026-09-04', '100', null)];
    const index = buildLastGestorIndex(records);
    const customers = customersFrom(records);
    assert.equal(getLastGestorExportColumns(customers[0], index)['Último gestor'], 'Ana');
    assert.equal(getLastGestorExportColumns(customers[1], index)['Último gestor'], 'Sin gestor registrado');
});
