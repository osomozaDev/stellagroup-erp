-- Aviso de Telegram con la agenda del día, activado para quien ya tiene el chat conectado
alter table telegram_chats alter column avisos set default '{rebotes,cobradas,vencidas,facturar,renovaciones,firmas,semanal,agenda}';
update telegram_chats set avisos = array_append(avisos, 'agenda') where not 'agenda' = any(avisos);
