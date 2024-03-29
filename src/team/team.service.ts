/* eslint-disable @typescript-eslint/no-unused-vars */
import _ from 'lodash';
import { parse } from 'papaparse';
import { Repository } from 'typeorm';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { UpdateTeamDto } from './dto/update-team.dto';
import { Team } from './entities/team.entity';
import { Player } from './entities/player.entity';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
    @InjectRepository(Player)
    private readonly playerRepository: Repository<Player>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {}

  async findAll(): Promise<Team[]> {
    return await this.teamRepository.find({
      select: ['id', 'name'],
    });
  }

  async findOne(id: number) {
    return await this.verifyTeamById(id);
  }

  async create(file: Express.Multer.File) {
    if (!file.originalname.endsWith('.csv')) {
      throw new BadRequestException('CSV 파일만 업로드 가능합니다.');
    }

    const csvContent = file.buffer.toString();

    let parseResult;
    try {
      parseResult = parse(csvContent, {
        header: true,
        skipEmptyLines: true,
      });
    } catch (error) {
      throw new BadRequestException('CSV 파싱에 실패했습니다.');
    }

    const teamsData = parseResult.data as any[];

    for (const teamData of teamsData) {
      if (_.isNil(teamData.name) || _.isNil(teamData.description)) {
        throw new BadRequestException(
          'CSV 파일은 name과 description 컬럼을 포함해야 합니다.',
        );
      }
    }

    const createTeamDtos = teamsData.map((teamData) => ({
      name: teamData.name,
      description: teamData.description,
    }));

    await this.teamRepository.save(createTeamDtos);
  }

  async update(id: number, updateTeamDto: UpdateTeamDto) {
    await this.verifyTeamById(id);
    await this.teamRepository.update({ id }, updateTeamDto);
  }

  async delete(id: number) {
    await this.verifyTeamById(id);
    await this.teamRepository.delete({ id });
  }

  private async verifyTeamById(id: number) {
    const team = await this.teamRepository.findOneBy({ id });
    if (_.isNil(team)) {
      throw new NotFoundException('존재하지 않는 팀입니다.');
    }

    return team;
  }

  // ===============================================
  // Player 관련 API
  // ===============================================
  async findAllPlayers(query: PaginationQueryDto) {
    const { page = 1, page_size = 10, name, nickname } = query;

    const queryBuilder = this.playerRepository.createQueryBuilder('player');
    // .skip((page - 1) * page_size)
    // .take(page_size);

    if (name) {
      queryBuilder.andWhere('player.name LIKE :name', { name: `%${name}%` });
    }

    if (nickname) {
      queryBuilder.andWhere('player.nickname LIKE :nickname', {
        nickname: `%${nickname}%`,
      });
    }

    if (name && nickname) {
      let searchAllPlayers = await this.cacheManager.get('searchAllPlayers'); // null
      if (!searchAllPlayers) {
        searchAllPlayers = await queryBuilder.getMany(); // ORM sql 실행
        await this.cacheManager.set(
          'searchAllPlayers',
          searchAllPlayers,
          1000 * 60 * 5, // TTL : 얼마나 살아있냐, ms
        );
      } else {
        console.log('=========== cache hit! ===========');
      }
      return searchAllPlayers;
    }
    const players = await queryBuilder.getMany();
    return players;
  }

  async findPlayersByTeamId(teamId: number, query: PaginationQueryDto) {
    const { page = 1, page_size = 10, name, nickname } = query;

    const queryBuilder = this.playerRepository
      .createQueryBuilder('player')
      .where('player.team_id = :team_id', { team_id: teamId })
      .skip((page - 1) * page_size)
      .take(page_size);

    if (name) {
      queryBuilder.andWhere('player.name LIKE :name', { name: `%${name}%` });
    }

    if (nickname) {
      queryBuilder.andWhere('player.nickname LIKE :nickname', {
        nickname: `%${nickname}%`,
      });
    }

    const players = await queryBuilder.getMany();
    return players;
  }

  /**
   * 각 팀에 대한 플레이어 수와 지원 메시지 수를 반환
   */
  async getTeamStats() {
    let stats = await this.cacheManager.get('teamStats');
    if (!stats) {
      // 캐시된 데이터가 없을 경우 데이터베이스에서 조회
      stats = await this.teamRepository
        .createQueryBuilder('team')
        .leftJoinAndSelect('team.players', 'player')
        .leftJoinAndSelect('team.supportMessages', 'supportMessage')
        .select('team.id', 'id')
        .addSelect('team.name', 'name')
        .addSelect('COUNT(DISTINCT player.id)', 'playerCount')
        .addSelect('COUNT(DISTINCT supportMessage.id)', 'supportMessageCount')
        .groupBy('team.id')
        .getRawMany(); // 데이터베이스에서 통계 계산하는 로직
      await this.cacheManager.set('teamStats', stats);
    }
    return stats;
  }
}
