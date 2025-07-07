import React, { useState, useCallback, useMemo } from 'react';
import { Upload, Users, Calendar, TrendingUp, AlertCircle, Download, DollarSign, Repeat, Target, Phone } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import * as XLSX from 'xlsx';

const NutritionDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showAllInactive, setShowAllInactive] = useState(false);

  // Función para procesar el archivo Excel real
  const processExcelFile = useCallback(async (file) => {
    setLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      // Procesar datos con la estructura real
      const processedData = analyzeNutritionData(jsonData);
      setData(processedData);
    } catch (error) {
      console.error('Error procesando archivo:', error);
      alert('Error al procesar el archivo. Verifica que sea un Excel válido.');
    }
    setLoading(false);
  }, []);

  // Función para analizar datos de nutrición con estructura real
  const analyzeNutritionData = (rawData) => {
    const today = new Date();
    const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, today.getDate());
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());

    // Filtrar datos válidos
    const validData = rawData.filter(row => 
      row['Rut paciente'] && 
      row['Fecha Sesión'] && 
      row['Monto']
    );

    // Parsear fechas desde formato "14-jul-2025 16:40"
    const parseDate = (fechaStr) => {
      try {
        if (typeof fechaStr === 'string') {
          const [fechaParte] = fechaStr.split(' ');
          const [dia, mes, año] = fechaParte.split('-');
          const meses = {
            'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
          };
          return new Date(parseInt(año), meses[mes], parseInt(dia));
        }
        return new Date(fechaStr);
      } catch {
        return null;
      }
    };

    // Procesar cada registro
    const processedRecords = validData.map(row => ({
      rut: row['Rut paciente'],
      nombre: row['Nombre'] || '',
      correo: row['Correo'] || '',
      celular: row['Celular'] || '',
      servicio: row['Servicio'] || '',
      fechaSesion: parseDate(row['Fecha Sesión']),
      fechaPago: parseDate(row['Fecha Pago']),
      medioPago: row['Medio de Pago'] || '',
      monto: parseFloat(row['Monto']) || 0,
      montoFinal: parseFloat(row['Monto Final']) || 0,
      fechaAbono: parseDate(row['Fecha Abono'])
    })).filter(record => record.fechaSesion && !isNaN(record.fechaSesion.getTime()));

    // 1. ANÁLISIS DE PACIENTES ÚNICOS
    const pacientesMap = new Map();
    processedRecords.forEach(record => {
      if (!pacientesMap.has(record.rut)) {
        pacientesMap.set(record.rut, {
          rut: record.rut,
          nombre: record.nombre,
          correo: record.correo,
          celular: record.celular,
          primeraVisita: record.fechaSesion,
          ultimaVisita: record.fechaSesion,
          totalAtenciones: 1,
          totalGastado: record.monto,
          servicios: new Set([record.servicio])
        });
      } else {
        const paciente = pacientesMap.get(record.rut);
        paciente.totalAtenciones++;
        paciente.totalGastado += record.monto;
        paciente.servicios.add(record.servicio);
        if (record.fechaSesion > paciente.ultimaVisita) {
          paciente.ultimaVisita = record.fechaSesion;
        }
        if (record.fechaSesion < paciente.primeraVisita) {
          paciente.primeraVisita = record.fechaSesion;
        }
      }
    });

    const pacientes = Array.from(pacientesMap.values());

    // 2. PACIENTES INACTIVOS
    const pacientesInactivos = pacientes.filter(p => p.ultimaVisita < twoMonthsAgo);

    // 3. TASA DE RETENCIÓN
    const pacientesConMasDeUnaVisita = pacientes.filter(p => p.totalAtenciones > 1);
    const tasaRetencion = (pacientesConMasDeUnaVisita.length / pacientes.length * 100);

    // 4. ANÁLISIS TEMPORAL (últimos 12 meses)
    const monthlyData = [];
    for (let i = 11; i >= 0; i--) {
      const fecha = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const mesAtenciones = processedRecords.filter(r => 
        r.fechaSesion.getMonth() === fecha.getMonth() && 
        r.fechaSesion.getFullYear() === fecha.getFullYear()
      );
      
      const pacientesDelMes = new Set(mesAtenciones.map(r => r.rut));
      const ingresos = mesAtenciones.reduce((sum, r) => sum + r.monto, 0);
      
      monthlyData.push({
        mes: fecha.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
        atenciones: mesAtenciones.length,
        pacientes: pacientesDelMes.size,
        ingresos: ingresos,
        promedioAtencion: mesAtenciones.length > 0 ? ingresos / mesAtenciones.length : 0
      });
    }

    // 5. ANÁLISIS DE SERVICIOS
    const serviciosMap = new Map();
    processedRecords.forEach(record => {
      const servicio = record.servicio;
      if (!serviciosMap.has(servicio)) {
        serviciosMap.set(servicio, {
          nombre: servicio,
          cantidad: 1,
          ingresos: record.monto,
          pacientesUnicos: new Set([record.rut])
        });
      } else {
        const s = serviciosMap.get(servicio);
        s.cantidad++;
        s.ingresos += record.monto;
        s.pacientesUnicos.add(record.rut);
      }
    });

    const serviciosData = Array.from(serviciosMap.values())
      .map(s => ({
        ...s,
        pacientesUnicos: s.pacientesUnicos.size,
        ingresoPromedio: s.ingresos / s.cantidad
      }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    // 6. DISTRIBUCIÓN DE PRECIOS
    const preciosData = processedRecords.reduce((acc, record) => {
      const precio = record.monto;
      acc[precio] = (acc[precio] || 0) + 1;
      return acc;
    }, {});

    const preciosChart = Object.entries(preciosData)
      .map(([precio, cantidad]) => ({
        precio: `$${parseFloat(precio).toLocaleString('es-CL')}`,
        cantidad,
        porcentaje: (cantidad / processedRecords.length * 100).toFixed(1)
      }))
      .filter(p => p.cantidad > 10) // Solo precios frecuentes
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 8);

    // 7. MEDIOS DE PAGO
    const mediosPagoData = processedRecords.reduce((acc, record) => {
      const medio = record.medioPago || 'Sin especificar';
      acc[medio] = (acc[medio] || 0) + 1;
      return acc;
    }, {});

    const mediosPagoChart = Object.entries(mediosPagoData)
      .map(([medio, cantidad]) => ({
        medio,
        cantidad,
        porcentaje: (cantidad / processedRecords.length * 100).toFixed(1)
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    // 8. MÉTRICAS GENERALES
    const totalIngresos = processedRecords.reduce((sum, r) => sum + r.monto, 0);
    const promedioMonto = totalIngresos / processedRecords.length;
    const valorPromedioPorPaciente = totalIngresos / pacientes.length;

    // 9. PACIENTES DEL MES ACTUAL
    const pacientesEsteMes = new Set(
      processedRecords
        .filter(r => 
          r.fechaSesion.getMonth() === today.getMonth() && 
          r.fechaSesion.getFullYear() === today.getFullYear()
        )
        .map(r => r.rut)
    ).size;

    return {
      totalAtenciones: processedRecords.length,
      totalPacientes: pacientes.length,
      pacientesInactivos,
      pacientesEsteMes,
      tasaRetencion,
      totalIngresos,
      promedioMonto,
      valorPromedioPorPaciente,
      monthlyData,
      serviciosData,
      preciosChart,
      mediosPagoChart,
      allPatients: pacientes,
      allRecords: processedRecords
    };
  };

  // Manejadores de drag and drop
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processExcelFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processExcelFile(e.target.files[0]);
    }
  };

  // Exportar pacientes inactivos
  const exportInactivePatients = () => {
    if (!data?.pacientesInactivos?.length) {
      alert('No hay pacientes inactivos para exportar');
      return;
    }
    
    try {
      // Crear headers del CSV
      const headers = ['RUT', 'Nombre', 'Correo', 'Celular', 'Última Visita', 'Días Sin Visita', 'Total Atenciones', 'Total Gastado', 'Promedio por Atención', 'Servicios Utilizados'];
      
      // Calcular días sin visita
      const today = new Date();
      
      // Crear filas de datos
      const rows = data.pacientesInactivos.map(p => {
        const diasSinVisita = Math.floor((today - p.ultimaVisita) / (1000 * 60 * 60 * 24));
        const promedioGasto = p.totalGastado / p.totalAtenciones;
        const servicios = Array.from(p.servicios).join('; ');
        
        return [
          `"${p.rut}"`,
          `"${p.nombre}"`,
          `"${p.correo}"`,
          `"${p.celular}"`,
          `"${p.ultimaVisita.toLocaleDateString('es-CL')}"`,
          diasSinVisita,
          p.totalAtenciones,
          `${p.totalGastado.toLocaleString('es-CL')}`,
          `${promedioGasto.toLocaleString('es-CL')}`,
          `"${servicios}"`
        ].join(',');
      });
      
      // Combinar headers y datos
      const csvContent = [headers.join(','), ...rows].join('\n');
      
      // Agregar BOM para caracteres especiales
      const BOM = '\uFEFF';
      const csvWithBOM = BOM + csvContent;
      
      // Crear y descargar archivo
      const blob = new Blob([csvWithBOM], { 
        type: 'text/csv;charset=utf-8;' 
      });
      
      // Crear enlace de descarga
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      
      // Nombre del archivo con fecha
      const fechaHoy = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `pacientes_inactivos_${fechaHoy}.csv`);
      
      // Simular click para descargar
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Limpiar URL
      URL.revokeObjectURL(url);
      
      // Mostrar confirmación
      alert(`✅ Archivo exportado exitosamente!\n📊 ${data.pacientesInactivos.length} pacientes inactivos\n📅 Fecha: ${fechaHoy}`);
      
    } catch (error) {
      console.error('Error al exportar:', error);
      alert('❌ Error al exportar el archivo. Por favor intenta nuevamente.');
    }
  };

  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#84CC16'];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Procesando datos de nutrición...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard Nutrición Deportiva</h1>
            <p className="text-gray-600">Analiza tus pacientes, ingresos y oportunidades</p>
          </div>
          
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Importar reporte de atenciones
            </h3>
            <p className="text-gray-500 mb-4">
              Arrastra tu archivo Excel aquí o haz clic para seleccionar
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
            >
              Seleccionar archivo
            </label>
          </div>
          
          <div className="mt-6 text-sm text-gray-500">
            <p className="font-medium mb-2">El archivo Excel debe contener:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>RUT del paciente</li>
              <li>Nombre y datos de contacto</li>
              <li>Servicio y fecha de sesión</li>
              <li>Monto y método de pago</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard Nutrición Deportiva</h1>
              <p className="text-gray-600">Análisis completo de pacientes e ingresos</p>
            </div>
            <button
              onClick={() => setData(null)}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Cambiar archivo
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* KPIs - Primera Fila */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Total Pacientes</p>
                <p className="text-3xl font-bold">{data.totalPacientes.toLocaleString('es-CL')}</p>
                <p className="text-blue-200 text-xs mt-1">{data.totalAtenciones.toLocaleString('es-CL')} atenciones</p>
              </div>
              <Users className="h-10 w-10 text-blue-200" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Ingresos Totales</p>
                <p className="text-3xl font-bold">${(data.totalIngresos / 1000000).toFixed(1)}M</p>
                <p className="text-green-200 text-xs mt-1">${data.promedioMonto.toLocaleString('es-CL')} promedio</p>
              </div>
              <DollarSign className="h-10 w-10 text-green-200" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Tasa de Retención</p>
                <p className="text-3xl font-bold">{data.tasaRetencion.toFixed(1)}%</p>
                <p className="text-purple-200 text-xs mt-1">Pacientes que repiten</p>
              </div>
              <Repeat className="h-10 w-10 text-purple-200" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-100 text-sm font-medium">Inactivos (+2 meses)</p>
                <p className="text-3xl font-bold">{data.pacientesInactivos.length}</p>
                <p className="text-red-200 text-xs mt-1">Para reactivar</p>
              </div>
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-10 w-10 text-red-200" />
                <button
                  onClick={exportInactivePatients}
                  className="p-2 bg-red-400 bg-opacity-30 rounded-lg hover:bg-opacity-50 transition-all"
                  title="Exportar lista"
                >
                  <Download className="h-5 w-5 text-red-100" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* KPIs - Segunda Fila */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm font-medium">Valor por Paciente</p>
                <p className="text-3xl font-bold">${(data.valorPromedioPorPaciente/1000).toFixed(0)}K</p>
                <p className="text-orange-200 text-xs mt-1">Promedio histórico</p>
              </div>
              <Target className="h-10 w-10 text-orange-200" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-indigo-100 text-sm font-medium">Pacientes Este Mes</p>
                <p className="text-3xl font-bold">{data.pacientesEsteMes}</p>
                <p className="text-indigo-200 text-xs mt-1">Únicos del mes</p>
              </div>
              <Calendar className="h-10 w-10 text-indigo-200" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-cyan-100 text-sm font-medium">Oportunidad</p>
                <p className="text-3xl font-bold">{(100 - data.tasaRetencion).toFixed(1)}%</p>
                <p className="text-cyan-200 text-xs mt-1">No regresan</p>
              </div>
              <Phone className="h-10 w-10 text-cyan-200" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm font-medium">Tipos de Servicio</p>
                <p className="text-3xl font-bold">{data.serviciosData.length}</p>
                <p className="text-emerald-200 text-xs mt-1">Servicios diferentes</p>
              </div>
              <TrendingUp className="h-10 w-10 text-emerald-200" />
            </div>
          </div>
        </div>

        {/* Contenido Principal - Layout Horizontal */}
        <div className="grid grid-cols-12 gap-6">
          {/* Columna Izquierda - Gráficos */}
          <div className="col-span-8 space-y-6">
            {/* Fila 1: Distribución y Tendencia */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Distribución Mensual</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={data.monthlyData.slice(-6)}
                      cx="50%"
                      cy="50%"
                      outerRadius={60}
                      fill="#8884d8"
                      dataKey="atenciones"
                      label={({ mes, atenciones }) => `${mes}: ${atenciones}`}
                    >
                      {data.monthlyData.slice(-6).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Evolución Atenciones</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.monthlyData.slice(-6)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="atenciones" fill="#8B5CF6" />
                    <Bar dataKey="pacientes" fill="#06B6D4" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Fila 2: Ingresos y Precios */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Ingresos Mensuales</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.monthlyData.slice(-6)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`$${value.toLocaleString('es-CL')}`, 'Ingresos']} />
                    <Bar dataKey="ingresos" fill="#10B981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Tendencia de Precios</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.monthlyData.slice(-6)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`$${value.toLocaleString('es-CL')}`, 'Precio Promedio']} />
                    <Line type="monotone" dataKey="promedioAtencion" stroke="#F59E0B" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Columna Derecha - Listas y Datos */}
          <div className="col-span-4 space-y-6">
            {/* Servicios Populares */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Servicios Populares</h3>
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {data.serviciosData.slice(0, 8).map((servicio, index) => (
                  <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate" title={servicio.nombre}>
                        {servicio.nombre.length > 25 ? servicio.nombre.substring(0, 25) + '...' : servicio.nombre}
                      </p>
                      <p className="text-xs text-gray-500">{servicio.pacientesUnicos} pacientes</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-blue-600 text-sm">{servicio.cantidad}</p>
                      <p className="text-xs text-gray-500">citas</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Oportunidades */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">🎯 Oportunidades</h3>
              <div className="space-y-3">
                <div className="p-3 bg-red-50 rounded border-l-3 border-red-400">
                  <h4 className="font-medium text-red-800 text-sm">Reactivación</h4>
                  <p className="text-red-700 text-xs">{data.pacientesInactivos.length} pacientes inactivos</p>
                </div>
                <div className="p-3 bg-yellow-50 rounded border-l-3 border-yellow-400">
                  <h4 className="font-medium text-yellow-800 text-sm">Retención</h4>
                  <p className="text-yellow-700 text-xs">{(100 - data.tasaRetencion).toFixed(1)}% no regresan</p>
                </div>
                <div className="p-3 bg-green-50 rounded border-l-3 border-green-400">
                  <h4 className="font-medium text-green-800 text-sm">Servicio Estrella</h4>
                  <p className="text-green-700 text-xs">{data.serviciosData[0]?.cantidad} atenciones</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Para Contactar - Todo el Ancho */}
        <div className="mt-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">📞 Pacientes para Contactar</h2>
                <p className="text-gray-600 mt-1">{data.pacientesInactivos.length} pacientes inactivos por más de 2 meses</p>
              </div>
              <button
                onClick={exportInactivePatients}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="h-5 w-5 mr-2" />
                Exportar Lista Completa
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {data.pacientesInactivos
                .slice(0, showAllInactive ? data.pacientesInactivos.length : 10)
                .map((paciente, index) => {
                  const diasSinVisita = Math.floor((new Date() - paciente.ultimaVisita) / (1000 * 60 * 60 * 24));
                  const potencial = paciente.totalGastado / paciente.totalAtenciones;
                  
                  return (
                    <div key={index} className="border-2 border-red-200 bg-red-50 rounded-lg p-4 hover:bg-red-100 hover:border-red-300 transition-all">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-semibold text-gray-900 truncate pr-2">{paciente.nombre}</h4>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-200 text-red-800 flex-shrink-0">
                          {diasSinVisita}d
                        </span>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center">
                          <span className="text-gray-500 w-12">RUT:</span>
                          <span className="font-medium text-gray-700">{paciente.rut}</span>
                        </div>
                        
                        <div className="flex items-center">
                          <span className="text-gray-500 w-12">Última:</span>
                          <span className="text-gray-700">{paciente.ultimaVisita.toLocaleDateString('es-CL')}</span>
                        </div>
                        
                        {paciente.celular && (
                          <div className="flex items-center">
                            <span className="text-gray-500 w-12">Tel:</span>
                            <span className="font-medium text-blue-600">{paciente.celular}</span>
                          </div>
                        )}
                        
                        {paciente.correo && (
                          <div className="flex items-center">
                            <span className="text-gray-500 w-12">Email:</span>
                            <span className="text-green-600 text-xs truncate">{paciente.correo}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-4 pt-3 border-t border-red-200">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="text-lg font-bold text-green-600">${(paciente.totalGastado/1000).toFixed(0)}K</div>
                            <div className="text-xs text-gray-500">{paciente.totalAtenciones} citas</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-gray-700">${(potencial/1000).toFixed(0)}K</div>
                            <div className="text-xs text-gray-500">por visita</div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Servicios */}
                      <div className="mt-3">
                        <div className="flex flex-wrap gap-1">
                          {Array.from(paciente.servicios).slice(0, 1).map((servicio, idx) => (
                            <span key={idx} className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                              {servicio.length > 15 ? servicio.substring(0, 15) + '...' : servicio}
                            </span>
                          ))}
                          {paciente.servicios.size > 1 && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">
                              +{paciente.servicios.size - 1}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            
            {/* Botón Ver Más / Ver Menos */}
            {data.pacientesInactivos.length > 10 && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => setShowAllInactive(!showAllInactive)}
                  className="inline-flex items-center px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  {showAllInactive ? (
                    <>
                      Ver menos pacientes
                      <span className="ml-3 text-xs bg-gray-200 px-3 py-1 rounded-full">
                        Mostrando todos ({data.pacientesInactivos.length})
                      </span>
                    </>
                  ) : (
                    <>
                      Ver todos los pacientes inactivos
                      <span className="ml-3 text-xs bg-red-200 text-red-800 px-3 py-1 rounded-full">
                        +{data.pacientesInactivos.length - 10} más
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
            
            {/* Resumen de oportunidad */}
            <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-yellow-800">💰 Resumen de Oportunidad</h4>
                  <p className="text-yellow-700 text-sm mt-1">
                    Potencial promedio de ${(data.pacientesInactivos.reduce((sum, p) => sum + p.totalGastado, 0) / data.pacientesInactivos.length / 1000).toFixed(0)}K por paciente reactivado
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-yellow-800">
                    ${(data.pacientesInactivos.reduce((sum, p) => sum + p.totalGastado, 0) / 1000000).toFixed(1)}M
                  </div>
                  <div className="text-sm text-yellow-600">potencial total de reactivación</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NutritionDashboard;