import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { SupabaseModule } from './comun/supabase.module';
import { AuthGuard } from './comun/auth.guard';
import { ClientesController } from './modulos/clientes.controller';
import { ProyectosController } from './modulos/proyectos.controller';
import { FacturasController } from './modulos/facturas.controller';
import { FacturasService } from './modulos/facturas.service';
import { EmpleadosController } from './modulos/empleados.controller';
import { NominasController } from './modulos/nominas.controller';
import { EmpresaController } from './modulos/empresa.controller';
import { InicioController } from './modulos/inicio.controller';
import { YoController } from './modulos/yo.controller';
import { UsuariosController } from './modulos/usuarios.controller';
import { GestoriaController } from './modulos/gestoria.controller';
import { CobrosController, CobrosService, CronController } from './modulos/cobros.controller';
import { CorreoService } from './comun/correo.service';
import { PresupuestosController } from './modulos/presupuestos.controller';
import { CatalogoController } from './modulos/catalogo.controller';
import { AgendaController, OportunidadesController } from './modulos/crm.controller';
import { ContratosController, PlantillasContratoController } from './modulos/contratos.controller';
import { FirmarController } from './modulos/firmar.controller';
import { FirmasService } from './modulos/firmas.service';
import { ServiciosController, ServiciosService } from './modulos/servicios.controller';
import { AvisosCorreoController } from './modulos/avisos-correo.controller';
import { TelegramService } from './comun/telegram.service';
import { TelegramController } from './modulos/telegram.controller';
import { AvisosTelegramService } from './modulos/avisos-telegram.service';
import { BotTelegramService } from './modulos/bot-telegram.service';
import { PresupuestosTelegramService } from './modulos/presupuestos-telegram.service';
import { PortalClientesController } from './modulos/portal-clientes.controller';
import { EnvioFacturaService } from './modulos/envio-factura.service';
import { FacturarTelegramService } from './modulos/facturar-telegram.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }), SupabaseModule, ScheduleModule.forRoot()],
  controllers: [
    PortalClientesController,
    YoController,
    UsuariosController,
    ClientesController,
    ProyectosController,
    FacturasController,
    EmpleadosController,
    NominasController,
    EmpresaController,
    InicioController,
    GestoriaController,
    CobrosController,
    CronController,
    PresupuestosController,
    CatalogoController,
    OportunidadesController,
    AgendaController,
    ContratosController,
    PlantillasContratoController,
    FirmarController,
    ServiciosController,
    AvisosCorreoController,
    TelegramController,
  ],
  providers: [FacturasService, CorreoService, CobrosService, ServiciosService, FirmasService, TelegramService, AvisosTelegramService, BotTelegramService, EnvioFacturaService, FacturarTelegramService, PresupuestosTelegramService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
