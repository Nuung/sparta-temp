/* eslint-disable @typescript-eslint/no-unused-vars */
import { SupportMessage } from '../../support-message/entities/support-message.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Player } from './player.entity';

@Entity({
  name: 'teams',
})
export class Team {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true, nullable: false })
  name: string;

  @Column({ type: 'varchar', nullable: false })
  description: string;

  @OneToMany(() => SupportMessage, (supportMessage) => supportMessage.team)
  supportMessages: SupportMessage[];

  @OneToMany(() => Player, (player) => player.team)
  players: Player[];
}
